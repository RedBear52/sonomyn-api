// Route to Convert Bitrate to 96k and, if necessary, slice into 25mb chunks
const express = require('express')
const app = express()
const port = 3000
const path = require('path')
const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg')
const multer = require('multer')
const archiver = require('archiver')
const cors = require('cors')
const bodyParser = require('body-parser')

app.use(cors())

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
// Handle audio file uploads w Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = '/tmp/my-uploads'
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    cb(null, file.fieldname + '-' + uniqueSuffix + ext)
  },
})

const upload = multer({ storage: storage })

// Test Routes
app.get('/api', (req, res) => {
  res.send(`You found my ffmpeg api root directory!`)
})

// Route to Convert Bitrate to 96k and, if necessary, slice into 25mb chunks
app.post('/api/reduce-15mb', upload.single('inputFile'), async (req, res) => {
  const inputFile = req.file // Input file path
  const outputFilePath = `${inputFile.originalname}` // Output file path

  ffmpeg()
    .input(inputFile.path)
    .audioBitrate('96k')
    .output(outputFilePath)
    .on('end', () => {
      console.log('Bitrate conversion completed.')
      if (fs.statSync(outputFilePath).size > 15000000) {
        console.log(fs.statSync(outputFilePath).size)
        console.log(
          'File size stillexceeds 15MB after bitrate reduction. Slicing into smaller files'
        )
        const oversizeOutputFile = fs.readFileSync(outputFilePath)
        sliceOverSizedFile(oversizeOutputFile, inputFile.originalname, res)
        console.log('Slicing completed.')
      } else {
        const filePath = path.resolve(outputFilePath)
        res.sendFile(filePath, (err) => {
          if (err) {
            console.log(err)
            res.status(500).send('Error sending audio file')
          } else {
            console.log('Audio file sent successfully')
            // fs.unlinkSync(inputFile.path) // Delete input file
            // fs.unlinkSync(outputFilePath) // Delete output file
            console.log('Files deleted successfully.')
          }
        })
      }
    })
    .on('error', (err) => {
      console.log(err)
      res.status(500).send('Error converting audio file')
    })
    .run()

  // Delete files and directories after all responses to the user have completed
  res.on('finish', () => {
    const directory = './'
    fs.readdir(directory, (err, files) => {
      if (err) throw err

      for (const file of files) {
        if (
          file.endsWith('.zip') ||
          file.endsWith('.mp3') ||
          file.endsWith('.wav')
        ) {
          fs.unlinkSync(path.join(directory, file))
          console.log(`Deleted file: ${file}`)
        } else if (
          file.includes('-slices') &&
          fs.statSync(path.join(directory, file)).isDirectory()
        ) {
          fs.rmSync(path.join(directory, file), { recursive: true })
          console.log(`Deleted directory: ${file}`)
        }
      }
    })
  })
})

const sliceOverSizedFile = async (oversizeOutputFile, filename, res) => {
  const outputDirectory = `${filename}-slices` // Directory to save slices

  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory)
  }

  const sliceSize = 15000000 // 25MB
  const sliceCount = Math.ceil(oversizeOutputFile.length / sliceSize)

  for (let i = 0; i < sliceCount; i++) {
    const start = i * sliceSize
    const end = (i + 1) * sliceSize
    const slice = oversizeOutputFile.slice(start, end)

    fs.writeFileSync(
      `${outputDirectory}/Sliced-${filename}-${i + 1}.mp3`,
      slice
    )
  }
  const output = fs.createWriteStream(`${outputDirectory}.zip`)
  const archive = archiver('zip', { zlib: { level: 9 } })

  output.on('close', () => {
    console.log('Zip file created successfully')
    res.set('Content-Type', 'application/zip')
    res.download(`${outputDirectory}.zip`, (err) => {
      if (err) {
        console.log(err)
        res.status(500).send('Error sending zip file')
      } else {
        console.log('Zip file sent successfully')
        fs.unlinkSync(`${outputDirectory}.zip`)
        console.log('Zip file deleted successfully.')
      }
    })
  })

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn(err)
    } else {
      throw err
    }
  })

  archive.on('error', (err) => {
    console.log(err)
    res.status(500).send('Error creating zip file')
  })

  archive.pipe(output)
  archive.directory(outputDirectory, false)
  archive.finalize()
}

app.listen(port, () => {
  console.log(`Server is running at: http://localhost:${port}`)
})
