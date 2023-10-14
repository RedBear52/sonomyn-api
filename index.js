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

  console.log(inputFile)

  ffmpeg()
    .input(inputFile.path)
    .audioBitrate('96k')
    .output(outputFilePath)
    .on('end', () => {
      console.log('Bitrate conversion completed.')
      if (fs.statSync(outputFilePath).size > 25600) {
        console.log(fs.statSync(outputFilePath).size)
        console.error(
          'Output file is larger than 25mb. Commencing slice functions.'
        )
        const oversizeOutputFile = fs.readFileSync(outputFilePath)
        // Code to take the value of inputFile.originalname, remove the file extension and then use it in the sliceDirectory variable
        const filename = inputFile.originalname
        const cleanedFileName = filename.replace(/\.[^/.]+$/, '')
        sliceOverSizedFile(oversizeOutputFile, cleanedFileName).then(
          // code to zip the slices and send them as a download
          () => {
            const zip = new require('node-zip')()
            const dir = `${cleanedFileName}-slices`
            const output = fs.createWriteStream(`${cleanedFileName}-slices.zip`)
            const archive = archiver('zip', {
              zlib: { level: 9 },
            })
            archive.pipe(output)
            archive.directory(dir, false)
            archive.finalize().then(() => {
              console.log('Slices completed.')
              res.sendFile(
                `/Users/ryanspearman/Desktop/software_projects/ffmpegProjects/sonomyn/${cleanedFileName}-slices.zip`
              )
            })
          }
        )
      } else {
        res.sendFile(
          `/Users/ryanspearman/Desktop/software_projects/ffmpegProjects/sonomyn/${outputFilePath}`
        ) // Send the processed file as a download
      }
    })
    .on('error', (err) => {
      console.error('Error converting bitrate:', err)
      res.status(500).json({ error: 'Bitrate conversion failed' })
    })
    .run()

  // Delete files and directories after all responses to the user have completed
  res.on('finish', () => {
    const directory = './'
    fs.readdir(directory, (err, files) => {
      if (err) throw err

      for (const file of files) {
        if (file.endsWith('.zip') || file.endsWith('.mp3')) {
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

const sliceOverSizedFile = async (oversizeOutputFile, filename) => {
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
}

app.listen(port, () => {
  console.log(`Server is running at: http://localhost:${port}`)
})
