const toneConstant = 1.059463
const sampleRate = 22050
const noteNamesAndFreqs = {
  C: 262,
  'C#': 277,
  D: 294,
  'D#': 311,
  E: 330,
  F: 349,
  'F#': 370,
  G: 392,
  'G#': 415,
  A: 440,
  'A#': 466,
  B: 494
}

let bpms
let notes
let pData
let tones
let rootNotes
let octaves
let noteLengths
let sequence
let columns
let playing = false
let audioCtx = new (window.AudioContext || window.webkitAudioContext)()
let buffer
let bufferSource
let bufferSizes
let timeStops
let millisPer16ths
let totalMillis
let sampleNotes
let sequenceSelects

const generateNoteNames = (startNote) => {
  const noteNames = Object.keys(noteNamesAndFreqs)
  let index = noteNames.indexOf(startNote)

  if (index === -1) {
    return []
  }

  let names = []
  let namesIndex = 0

  while (namesIndex <= 12) {
    if (index > 11) index = 0

    names[namesIndex] = noteNames[index]

    index++
    namesIndex++
  }

  return names.reverse()
}

const forEach = (array, callback, scope) => {
  for (let i = 0; i < array.length; i++) {
    callback.call(scope, i, array[i])
  }
}

const paintAll = () => {
  pData.forEach((phrase, pIndex) => {
    phrase.forEach((chart, index) => {
      const table = document.querySelector(`#chart${pIndex}-${index}`)
      const trs = table.querySelectorAll('tbody tr')

      forEach(trs, (i, tr) => {
        const tds = tr.querySelectorAll('td')

        forEach(tds, (j, td) => {
          if (pData[pIndex][index][j] === i) {
            td.classList.remove("red", "green", "blue", "orange", "purple")
            td.classList.add(toneClass(tones[pIndex][index] || 0))
          } else {
            td.classList.remove("red", "green", "blue", "orange", "purple")
          }
        })
      })
    })
  })
}

const toneClass = (index) => {
  switch (index) {
    case 0:
      return 'red'
    case 1:
      return 'blue'
    case 2:
      return 'green'
    case 3:
      return 'orange'
    case 4:
      return 'purple'
  }
}

const changeTempo = (e) => {
  const pIndex = parseInt(e.target.id.slice(3))
  let restart = false

  if (playing) {
    restart = true
  }

  stop()

  bpms[pIndex] = parseInt(e.target.value)

  generateSound()

  if (restart) {
    play()
  }

  history.replaceState(null, '', '?p=' + encodeAll())
}

const changeTone = (e) => {
  const indexStr = e.target.id.slice(4)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const pIndex = indicies[0]
  const index = indicies[1]

  tones[pIndex][index] = parseInt(e.target.value)

  history.replaceState(null, '', '?p=' + encodeAll())
  paintAll()
  generateSound()
  generateSampleTones()
}

const changeOctave = (e) => {
  const indexStr = e.target.id.slice(6)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const pIndex = indicies[0]
  const index = indicies[1]

  octaves[pIndex][index] = parseInt(e.target.value)

  history.replaceState(null, '', '?p=' + encodeAll())
  generateNotes(pIndex, index)
  paintAll()
  generateSound()
  generateSampleTones()
}

const changeNoteLength = (e) => {
  const indexStr = e.target.id.slice(10)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const pIndex = indicies[0]
  const index = indicies[1]

  noteLengths[pIndex][index] = parseFloat(e.target.value)

  history.replaceState(null, '', '?p=' + encodeAll())
  generateNotes(pIndex, index)
  paintAll()
  generateSound()
  generateSampleTones()
}

const changeRoot = (e) => {
  const note = e.target.value
  const pIndex = parseInt(e.target.id.slice(3))

  setNoteText(pIndex, note)

  rootNotes[pIndex] = note

  history.replaceState(null, '', '?p=' + encodeAll())

  for (let i = 0; i < pData[pIndex].length; i++) {
    generateNotes(pIndex, i)
  }

  paintAll()
  generateSound()
  generateSampleTones()
}

const setNoteText = (pIndex, note) => {
  const newNotes = generateNoteNames(note)

  const phrase = document.querySelector(`#phrase${pIndex}`)
  const tables = phrase.querySelectorAll('table')

  forEach(tables, (tableIndex, table) => {
    const trs = table.querySelectorAll('tr')

    forEach(trs, (rowIndex, tr) => {
      const firstTd = tr.querySelector('td')

      if (rowIndex < newNotes.length) {
        firstTd.innerText = newNotes[rowIndex]
      } else {
        firstTd.innerText = newNotes[0]
      }
    })
  })
}

const generateNotes = (pIndex, index) => {
  let octaveShift = Math.pow(toneConstant, 12)
  let octaveShiftCount = 0

  if (octaves[pIndex][index] < 4) {
    octaveShift = 1 / Math.pow(toneConstant, 12)
    octaveShiftCount = 4 - octaves[pIndex][index]
  } else if (octaves[pIndex][index] > 4) {
    octaveShiftCount = octaves[pIndex][index] - 4
  }

  let rootValue = noteNamesAndFreqs[rootNotes[pIndex]]
  for (let i = 0; i < octaveShiftCount; i++) {
    rootValue = rootValue * octaveShift 
  }

  notes[pIndex][index] = []
  notes[pIndex][index][12] = rootValue

  for (let i = 12; i >= 0; i--) {
    notes[pIndex][index][12 - i] = generateNoteFrequency(i, rootValue)
  }
}

const deleteChart = (e) => {
  const indexStr = e.target.id.slice(6)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const pIndex = indicies[0]
  let index = indicies[1]

  if (pData[pIndex] <= 1) {
    return
  }

  document.querySelector(`#container${pIndex}-${index}`).remove()

  pData[pIndex].splice(index, 1)
  tones[pIndex].splice(index, 1)
  octaves[pIndex].splice(index, 1)
  noteLengths[pIndex].splice(index, 1)
  notes[pIndex].splice(index, 1)

  while (index < pData[pIndex].length) {
    let cont = document.querySelector(`#container${pIndex}-${index + 1}`)
    let tab = cont.querySelector(`#chart${pIndex}-${index + 1}`)
    let del = cont.querySelector('button.delete')
    let lis = cont.querySelector('select.tone')
    let oct = cont.querySelector('select.octave')
    let ntl = cont.querySelector('select.notelength')

    cont.id = `container${pIndex}-${index}`
    tab.id = `chart${pIndex}-${index}`
    del.id = `delete${pIndex}-${index}`
    lis.id = `inst${pIndex}-${index}`
    oct.id = `octave${pIndex}-${index}`
    ntl.id = `notelength${pIndex}-${index}`

    index++
  }

  assignCellClicks()
  generateSound()
  gatherColumns()
  history.replaceState(null, '', '?p=' + encodeAll())
}

const createPhrase = () => {
  const phrases = document.querySelector('.phrases')
  const proto = document.querySelector("div.proto")
  const pIndex = pData.length

  let phraseContainer = document.createElement('div')
  phraseContainer.className = 'phrase'
  phraseContainer.id = `phrase${pIndex}`

  let phraseNo = document.createElement('h3')
  phraseNo.innerText = pIndex + 1

  let bpmContainer = document.createElement('div')
  let bpmLabel = document.createElement('label')
  bpmLabel.for = `bpm${pIndex}`
  bpmLabel.innerText = 'bpm'

  let bpm = document.createElement('input')
  bpm.type = 'number'
  bpm.min = 40
  bpm.max = 200
  bpm.value = bpms[pIndex - 1]
  bpm.id = `bpm${pIndex}`
  bpm.onchange = changeTempo

  let keyLabel = document.createElement('label')
  keyLabel.for = `key${pIndex}`
  keyLabel.innerText = 'key'

  let keySelect = document.createElement('select')
  keySelect.id = `key${pIndex}`
  keySelect.onchange = changeRoot

  Object.keys(noteNamesAndFreqs).forEach(name => {
    let keyOpt = document.createElement('option')
    keyOpt.text = name
    keyOpt.value = name
    keySelect.add(keyOpt)
  })

  let dupButton = document.createElement('button')
  dupButton.innerText = 'duplicate'
  dupButton.id = `dupphrase${pIndex}`
  dupButton.onclick = duplicatePhrase

  let delButton = document.createElement('button')
  delButton.innerText = 'delete'
  delButton.id = `delphrase${pIndex}`
  delButton.onclick = deletePhrase

  phraseContainer.appendChild(phraseNo)
  bpmContainer.appendChild(bpmLabel)
  bpmContainer.appendChild(bpm)
  bpmContainer.appendChild(keyLabel)
  bpmContainer.appendChild(keySelect)
  bpmContainer.appendChild(dupButton)
  bpmContainer.appendChild(delButton)
  phraseContainer.appendChild(bpmContainer)

  let add = document.createElement('div')
  add.className = 'add'
  add.id = `add${pIndex}`
  add.onclick = createChart
  add.innerText = '+'

  phraseContainer.appendChild(add)
  phrases.appendChild(phraseContainer)

  pData[pIndex] = []
  tones[pIndex] = []
  rootNotes[pIndex] = 'C'
  octaves[pIndex] = []
  noteLengths[pIndex] = []
  notes[pIndex] = []
  bpms[pIndex] = bpms[pIndex - 1]
  createChart({target: {id: `add${pIndex}`}})
}

const createChart = (e) => {
  const pIndex = parseInt(e.target.id.slice(3))
  const proto = document.querySelector("div.proto")
  const phrases = document.querySelector('.phrases')
  const chartIndex = pData[pIndex].length

  let phraseContainer = document.querySelector(`#phrase${pIndex}`)
  let chartContainer = proto.cloneNode(true)
  let chart = chartContainer.querySelector('table')
  let deleteButton = chartContainer.querySelector('button.delete')
  let lis = chartContainer.querySelector('select.tone')
  let oct = chartContainer.querySelector('select.octave')
  let ntl = chartContainer.querySelector('select.notelength')
  let add = phraseContainer.querySelector(`#add${pIndex}`)

  chartContainer.classList.remove('proto')
  chartContainer.id = `container${pIndex}-${chartIndex}`
  chart.className = 'grid'
  chart.id = `chart${pIndex}-${chartIndex}`
  deleteButton.id = `delete${pIndex}-${chartIndex}`
  deleteButton.onclick = deleteChart
  lis.id = `inst${pIndex}-${chartIndex}`
  lis.onchange = changeTone
  oct.id = `octave${pIndex}-${chartIndex}`
  oct.onchange = changeOctave
  ntl.id = `notelength${pIndex}-${chartIndex}`
  ntl.onchange = changeNoteLength

  phraseContainer.insertBefore(chartContainer, add)

  pData[pIndex][chartIndex] = []
  tones[pIndex][chartIndex] = 1
  octaves[pIndex][chartIndex] = 3
  noteLengths[pIndex][chartIndex] = 1.0
  generateNotes(pIndex, chartIndex)
  paintAll()
  setInsts()
  setRoots()
  setOctaves()
  setNoteLengths()
  assignCellClicks()
  generateSound()
  generateSampleTones()
  gatherColumns()
  history.replaceState(null, '', '?p='.concat(encodeAll()))
}

const duplicatePhrase = (e) => {
  let pIndex = parseInt(e.target.id.slice(9))
  let encoded = encodePhrase(pIndex)
  let current = encodeAll()

  history.replaceState(null, '', '?p='.concat(current.concat('|', encoded)))
  init()
}

const deletePhrase = (e) => {
  let pIndex = parseInt(e.target.id.slice(9))
  let parts = encodeAll().split('|')

  parts.splice(pIndex + 1, 1) // account for "sequence" data at position 0
  history.replaceState(null, '', '?p='.concat(parts.join('|')))
  init()
}

const createCharts = () => {
  const proto = document.querySelector("div.proto")
  const phrases = document.querySelector('.phrases')

  while (phrases.firstChild) phrases.removeChild(phrases.lastChild)

  pData.forEach((phrase, pIndex) => {
    let phraseContainer = document.createElement('div')
    phraseContainer.className = 'phrase'
    phraseContainer.id = `phrase${pIndex}`

    let phraseNo = document.createElement('h3')
    phraseNo.innerText = pIndex + 1

    let bpmContainer = document.createElement('div')
    let bpmLabel = document.createElement('label')
    bpmLabel.for = `bpm${pIndex}`
    bpmLabel.innerText = 'bpm'

    let bpm = document.createElement('input')
    bpm.type = 'number'
    bpm.min = 40
    bpm.max = 200
    bpm.value = bpms[pIndex]
    bpm.id = `bpm${pIndex}`
    bpm.onchange = changeTempo

    let keyLabel = document.createElement('label')
    keyLabel.for = `key${pIndex}`
    keyLabel.innerText = 'key'

    let keySelect = document.createElement('select')
    keySelect.id = `key${pIndex}`
    keySelect.onchange = changeRoot

    Object.keys(noteNamesAndFreqs).forEach(name => {
      let keyOpt = document.createElement('option')
      keyOpt.text = name
      keyOpt.value = name
      keySelect.add(keyOpt)
    })

    let dupButton = document.createElement('button')
    dupButton.innerText = 'duplicate'
    dupButton.id = `dupphrase${pIndex}`
    dupButton.onclick = duplicatePhrase

    let delButton = document.createElement('button')
    delButton.innerText = 'delete'
    delButton.id = `delphrase${pIndex}`
    delButton.onclick = deletePhrase

    phraseContainer.appendChild(phraseNo)
    bpmContainer.appendChild(bpmLabel)
    bpmContainer.appendChild(bpm)
    bpmContainer.appendChild(keyLabel)
    bpmContainer.appendChild(keySelect)
    bpmContainer.appendChild(dupButton)
    bpmContainer.appendChild(delButton)
    phraseContainer.appendChild(bpmContainer)

    phrase.forEach((_, chartIndex) => {
      let chartContainer = proto.cloneNode(true)
      let chart = chartContainer.querySelector('table')
      let deleteButton = chartContainer.querySelector('button.delete')
      let lis = chartContainer.querySelector('select.tone')
      let oct = chartContainer.querySelector('select.octave')
      let ntl = chartContainer.querySelector('select.notelength')

      chartContainer.classList.remove('proto')
      chartContainer.id = `container${pIndex}-${chartIndex}`
      chart.className = 'grid'
      chart.id = `chart${pIndex}-${chartIndex}`
      deleteButton.id = `delete${pIndex}-${chartIndex}`
      deleteButton.onclick = deleteChart
      lis.id = `inst${pIndex}-${chartIndex}`
      lis.onchange = changeTone
      oct.id = `octave${pIndex}-${chartIndex}`
      oct.onchange = changeOctave
      ntl.id = `notelength${pIndex}-${chartIndex}`
      ntl.onchange = changeNoteLength

      phraseContainer.appendChild(chartContainer)
    })

    let add = document.createElement('div')
    add.className = 'add'
    add.id = `add${pIndex}`
    add.onclick = createChart
    add.innerText = '+'

    phraseContainer.appendChild(add)
    phrases.appendChild(phraseContainer)
  })
}

const setInsts = () => {
  pData.forEach((phrase, pIndex) => {
    tones[pIndex].forEach((tone, index) => {
      let inst = document.querySelector(`#inst${pIndex}-${index}`)
      inst.value = tone
    })
  })
}

const setRoots = () => {
  rootNotes.forEach((root, index) => {
    let r = document.querySelector(`#key${index}`)
    r.value = root
    setNoteText(index, root)
  })
}

const setOctaves = () => {
  pData.forEach((phrase, pIndex) => {
    octaves[pIndex].forEach((octave, index) => {
      let o = document.querySelector(`#octave${pIndex}-${index}`)
      o.value = octave
    })
  })
}

const setNoteLengths = () => {
  pData.forEach((phrase, pIndex) => {
    noteLengths[pIndex].forEach((noteLength, index) => {
      let n = document.querySelector(`#notelength${pIndex}-${index}`)
      n.value = noteLength.toString()
    })
  })
}

const changeSequence = (e) => {
  let index = parseInt(e.target.id.slice(4))

  if (e.target.value === '-') {
    if (index < sequence.length - 1) {
      sequence = sequence.slice(0, index)
    }
  } else {
    sequence[index] = parseInt(e.target.value)
  }

  remakeSequenceSelects()
  generateSound()
  history.replaceState(null, '', '?p=' + encodeAll())
}

const remakeSequenceSelects = () => {
  sequenceSelects = []

  let sequenceSteps = document.querySelector('#sequence')

  while (sequenceSteps.firstChild) sequenceSteps.removeChild(sequenceSteps.lastChild)

  sequence.concat('-').forEach((ps, index) => {
    let select = document.createElement('select')
    select.className = 'step'
    select.id = `step${index}`

    let opt = document.createElement('option')
    opt.text = '-'
    select.add(opt)

    for (let i = 1; i <= pData.length; i++) {
      let opt = document.createElement('option')
      opt.value = i
      opt.text = i
      select.add(opt)
    }

    select.value = ps
    select.onchange = changeSequence
    sequenceSteps.appendChild(select)
    sequenceSelects.push(select)
  })
}

const init = () => {
  bpms = []
  notes = []
  pData = []
  tones = []
  rootNotes = []
  octaves = []
  noteLengths = []
  sequence = []

  const params = (new URL(document.location)).searchParams
  const phraseParam = params.get('p')

  if (phraseParam !== null && phraseParam !== undefined) {
    const phrases = phraseParam.split('|')

    sequence = phrases.shift().split('').map(n => parseInt(n, 16))

    phrases.forEach((phrasePatterns, pIndex) => {
      const patterns = phrasePatterns.split(';')

      const pattern = patterns.shift()
      bpms[pIndex] = parseInt(pattern.slice(0, 2), 16)
      rootNotes[pIndex] = Object.keys(noteNamesAndFreqs)[parseInt(pattern[2], 16)]
      pData[pIndex] = []
      tones[pIndex] = []
      octaves[pIndex] = []
      noteLengths[pIndex] = []
      notes[pIndex] = []

      patterns.forEach((pattern, index) => {
        pData[pIndex][index] = []

        if (!!pattern) {
          const tone = parseInt(pattern[0])
          const octave = parseInt(pattern[1])
          const noteLength = parseFloat([0.25, 0.5, 0.75, 1.0][parseInt(pattern[2])])

          tones[pIndex][index] = tone
          octaves[pIndex][index] = octave
          noteLengths[pIndex][index] = noteLength
          generateNotes(pIndex, index)

          if (pattern.length > 3) {
            pattern.slice(3)
            .split('')
            .reduce((result, value, i, array) => {
              if (i % 2 === 0)
                result.push(array.slice(i, i + 2))
              return result
            }, [])
            .forEach((row) => {
              const columnIndex = parseInt(row[0], 16)
              const noteIndex = parseInt(row[1], 16)
              pData[pIndex][index][columnIndex] = noteIndex
            })
          }
        }
      })
    })
  } else {
    pData[0] = [[]]
    sequence = [1]
    bpms[0] = 110
    tones[0] = [1]
    rootNotes[0] = 'C'
    octaves[0] = [3]
    noteLengths[0] = [1.0]
    notes[0] = []
    generateNotes(0, 0)
  }

  createCharts()
  assignCellClicks()
  paintAll()
  setInsts()
  setRoots()
  setOctaves()
  remakeSequenceSelects()
  setNoteLengths()
  generateSound()
  generateSampleTones()
  gatherColumns()

  document.onkeydown = (e) => {
    if (e.code === "Space") {
      e.preventDefault()

      if (playing) {
        stop()
      } else {
        play()
      }
    }
  }
}

const assignCellClicks = () => {
  const phrases = document.querySelectorAll('.phrase')

  forEach(phrases, (_, phrase) => {
    const pIndex = parseInt(phrase.id.slice(6))
    const tables = phrase.querySelectorAll('table')

    forEach(tables, (_, table) => {
      const trs = table.querySelectorAll('tr')
      const indexStr = table.id.slice(5)
      const tableIndex = parseInt(indexStr.split('-')[1])

      forEach(trs, (rowIndex, tr) => {
        const tds = tr.querySelectorAll('td')

        forEach(tds, (dataIndex, td) => {
          td.onclick = (e) => {
            if (pData[pIndex][tableIndex][dataIndex] === rowIndex) {
              pData[pIndex][tableIndex][dataIndex] = null
            } else {
              pData[pIndex][tableIndex][dataIndex] = rowIndex

              bufferSource = audioCtx.createBufferSource()
              bufferSource.connect(audioCtx.destination)
              bufferSource.buffer = sampleTones[pIndex][tableIndex][rowIndex]
              bufferSource.start()
            }

            paintAll()
            generateSound()
            history.replaceState(null, '', '?p=' + encodeAll())
          }
        })
      })
    })
  })
}

const prepareDownload = () => {
  const newFile = URL.createObjectURL(bufferToWave(buffer, buffer.length))
  const link = document.querySelector('#download')
  link.href = newFile
  link.download = "quickloop.wav"
}

// Convert AudioBuffer to a Blob using WAVE representation
function bufferToWave(abuffer, len) {
  let numOfChan = abuffer.numberOfChannels
  let length = len * numOfChan * 2 + 44
  let buffer = new ArrayBuffer(length)
  let view = new DataView(buffer)
  let channels = []
  let i
  let sample
  let offset = 0
  let pos = 0

  // write WAVE header
  setUint32(0x46464952)                         // "RIFF"
  setUint32(length - 8)                         // file length - 8
  setUint32(0x45564157)                         // "WAVE"

  setUint32(0x20746d66)                         // "fmt " chunk
  setUint32(16)                                 // length = 16
  setUint16(1)                                  // PCM (uncompressed)
  setUint16(numOfChan)
  setUint32(abuffer.sampleRate)
  setUint32(abuffer.sampleRate * 2 * numOfChan) // avg. bytes/sec
  setUint16(numOfChan * 2)                      // block-align
  setUint16(16)                                 // 16-bit (hardcoded in this demo)

  setUint32(0x61746164)                         // "data" - chunk
  setUint32(length - pos - 4)                   // chunk length

  // write interleaved data
  for(i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i))

  while(pos < length) {
    for(i = 0; i < numOfChan; i++) {             // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][offset])) // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0 // scale to 16-bit signed int
      view.setInt16(pos, sample, true)          // write 16-bit sample
      pos += 2
    }

    offset++                                     // next source sample
  }

  // create Blob
  return new Blob([buffer], {type: "audio/wav"})

  function setUint16(data) {
    view.setUint16(pos, data, true)
    pos += 2
  }

  function setUint32(data) {
    view.setUint32(pos, data, true)
    pos += 4
  }
}

const encodePhrase = (pIndex) => {
  let phrase = pData[pIndex]
  let beatString = ''

  beatString = beatString.concat(bpms[pIndex].toString(16).toUpperCase().padStart(2, '0'))
  beatString = beatString.concat(Object.keys(noteNamesAndFreqs).indexOf(rootNotes[pIndex]).toString(16))
  beatString = beatString.concat(';')

  phrase.forEach((data, index) => {
    beatString = beatString.concat(tones[pIndex][index])
    beatString = beatString.concat(octaves[pIndex][index])
    beatString = beatString.concat([0.25, 0.5, 0.75, 1.0].indexOf(noteLengths[pIndex][index]))

    data.forEach((noteIndex, index) => {
      if (noteIndex !== null && noteIndex !== undefined) {
        beatString = beatString.concat(index.toString(16).toUpperCase(), noteIndex.toString(16).toUpperCase())
      }
    })

    beatString = beatString.concat(';')
  })

  return beatString.slice(0, -1)
}

const encodeAll = () => {
  let beatString = sequence.map(s => s.toString(16)).join('').concat('|')

  pData.forEach((phrase, pIndex) => {
    beatString = beatString.concat(bpms[pIndex].toString(16).toUpperCase().padStart(2, '0'))
    beatString = beatString.concat(Object.keys(noteNamesAndFreqs).indexOf(rootNotes[pIndex]).toString(16))
    beatString = beatString.concat(';')

    phrase.forEach((data, index) => {
      beatString = beatString.concat(tones[pIndex][index])
      beatString = beatString.concat(octaves[pIndex][index])
      beatString = beatString.concat([0.25, 0.5, 0.75, 1.0].indexOf(noteLengths[pIndex][index]))

      data.forEach((noteIndex, index) => {
        if (noteIndex !== null && noteIndex !== undefined) {
          beatString = beatString.concat(index.toString(16).toUpperCase(), noteIndex.toString(16).toUpperCase())
        }
      })

      beatString = beatString.concat(';')
    })

    beatString = beatString.slice(0, -1)
    beatString = beatString.concat('|')
  })

  return beatString.slice(0, -1)
}

const generateNoteFrequency = (multiplier, root) => {
  let val = root

  for (let i = 0; i < multiplier; i++) {
    val = val * toneConstant
  }

  return parseInt(val)
}

const waveFunction = (i) => {
  switch (i) {
    case 0:
      return squareSample
    case 1:
      return sineSample
    case 2:
      return triangleSample
    case 3:
      return fuzzSample
    default:
      return squareSample
  }
}

const generateSound = () => {
  let bSize = 0
  let beatsPerMeasure = 4

  bufferSizes = []
  timeStops = []
  millisPer16ths = []
  totalMillis = 0

  pData.forEach((p, pIndex) => {
    let pbpm = bpms[pIndex]
    let beatsPerSecond = pbpm / 60.0
    let secondsPerBeat = 1.0 / beatsPerSecond
    let seconds = secondsPerBeat * beatsPerMeasure
    let phraseBufferSize = parseInt(seconds * sampleRate)
    bufferSizes[pIndex] = phraseBufferSize
  })

  sequence.forEach((seqNo, index) => {
    let pIndex = seqNo - 1
    let pbpm = bpms[pIndex]
    let beatsPerSecond = pbpm / 60.0
    let secondsPerBeat = 1.0 / beatsPerSecond
    let seconds = secondsPerBeat * beatsPerMeasure
    let millis = Math.round(seconds * 1000)
    let phraseBufferSize = parseInt(seconds * sampleRate)
    let interval = Math.round(millis / 16)

    totalMillis += millis
    timeStops[index] = totalMillis
    millisPer16ths[index] = interval
    bSize += phraseBufferSize
  })

  buffer = audioCtx.createBuffer(1, bSize, sampleRate)

  generateTones()
  prepareDownload()
}

const gatherColumns = () => {
  columns = []

  for (let i = 0; i < pData.length; i++) {
    columns[i] = []

    for (let j = 0; j < 16; j++) {
      columns[i][j] = []
    }
  }

  for (let i = 0; i < pData.length; i++) {
    for (let j = 0; j < pData[i].length; j++) {
      const table = document.querySelector(`#chart${i}-${j}`)
      const trs = table.querySelectorAll('tbody tr')

      forEach(trs, (k, tr) => {
        const tds = tr.querySelectorAll('td')

        forEach(tds, (l, td) => {
          columns[i][l].push(td)
        })
      })
    }
  }
}

const waveMultiplier = (index, bufferSize, noteLength) => {
  if (noteLength === 1) return 1

  let thing = ((bufferSize * noteLength) - index) / (bufferSize * noteLength)

  return Math.max(0, thing)
}

const generateSampleTones = () => {
  sampleTones = []

  for (let i = 0; i < pData.length; i++) {
    sampleTones[i] = []

    let bufferSize = bufferSizes[i]
    let subBufferSize = Math.round(bufferSize / 16) // just doing 16th notes in 4/4 FOR NOW

    for (let j = 0; j < notes[i].length; j++) {
      sampleTones[i][j] = []

      for (let k = 0; k < notes[i][j].length; k++) {
        let buffer = audioCtx.createBuffer(1, subBufferSize, sampleRate)
        let buffering = buffer.getChannelData(0)

        for (let i = 0; i < buffering.length; i++) {
          buffering[i] = 0.0
        }

        let freq = notes[i][j][k]
        let samplesPerWave = parseInt(sampleRate / freq)
        let localIndex = 0
        let waveIndex = 0

        while (localIndex < subBufferSize) {
          let value = buffering[localIndex] || 0.0
          let waveMulti = waveMultiplier(localIndex, subBufferSize, noteLengths[i][j])
          let sample = waveFunction(tones[i][j])(waveIndex, samplesPerWave, waveMulti)

          value += sample

          if (value > 1.0)
            value = 1.0
          else if (value < -1.0)
            value = -1.0

          buffering[localIndex] = value

          waveIndex++
          localIndex++

          if (waveIndex >= samplesPerWave) waveIndex = 0
        }

        sampleTones[i][j][k] = buffer
      }
    }
  }
}

const expo = (x, max=100, lambda=4) => {
  const base = Math.log(x) / Math.log(lambda)
  const points = Array(x).fill(max)
  return points.map((point, n) => point / Math.pow(base, n)).reverse()
}

let leadIn = expo(100, 1.0)

const generateTones = () => {
  let buffering = buffer.getChannelData(0)
  let carryover = 0
  let waveIndex = 0
  let freq = 0
  let samplesPerWave = 0
  let lastSample = 0
  let offset = 0

  for (let i = 0; i < buffering.length; i++) {
    buffering[i] = 0.0
  }

  sequence.forEach((seqNo, index) => {
    let pIndex = seqNo - 1
    let phrase = pData[pIndex]
    let bufferSize = bufferSizes[pIndex]
    let subBufferSize = Math.round(bufferSize / 16) // just doing 16th notes in 4/4 FOR NOW
    let lastIndex = -1

    phrase.forEach((beatData, chartIndex) => {
      beatData.forEach((noteIndex, beatIndex) => {
        if (noteIndex !== null && noteIndex !== undefined) {
          let bufferPointer = offset + beatIndex * subBufferSize // start of the "16th" subsection
          let localIndex = 0

          const isCarryover = lastIndex === beatIndex - 1 || (lastIndex === 15 && beatIndex === 0)
          if (isCarryover && noteLengths[pIndex][chartIndex] === 1.0) {
            const noNextBeat = beatData[beatIndex + 1] === null || beatData[beatIndex + 1] === undefined 

            while (carryover > 0) {
              let nl = noteLengths[pIndex][chartIndex]
              let value = buffering[bufferPointer + localIndex] || 0.0
              let waveMulti = waveMultiplier(localIndex, subBufferSize, nl)
              const sample = waveFunction(tones[pIndex][chartIndex])(waveIndex, samplesPerWave, 1)

              value += sample

              if (value > 1.0)
                value = 1.0
              else if (value < -1.0)
                value = -1.0

              buffering[bufferPointer + localIndex] = value

              localIndex++
              waveIndex++
              carryover--
            }
          }

          waveIndex = 0
          freq = notes[pIndex][chartIndex][noteIndex]
          samplesPerWave = parseInt(sampleRate / freq)

          const noNextBeat = beatData[beatIndex + 1] === null || beatData[beatIndex + 1] === undefined 

          while (localIndex < subBufferSize) {
            let nl = noteLengths[pIndex][chartIndex]
            let value = buffering[bufferPointer + localIndex] || 0.0
            let waveMulti = waveMultiplier(localIndex, subBufferSize, nl)
            let sample = waveFunction(tones[pIndex][chartIndex])(waveIndex, samplesPerWave, waveMulti)

            // if (localIndex < 220) sample = 0
            // if (localIndex < 1000) {
            //   sample = sample * (localIndex / 1000)
            // }

            value += sample

            if (value > 1.0)
              value = 1.0
            else if (value < -1.0)
              value = -1.0

            buffering[bufferPointer + localIndex] = value

            waveIndex++
            localIndex++
            lastIndex = beatIndex
            lastSample = sample

            if (waveIndex >= samplesPerWave) waveIndex = 0
          }

          let overtime = samplesPerWave - waveIndex

          while (overtime > 0 && bufferPointer + localIndex < buffering.length) {
            overtime--
            localIndex++
          }

          carryover = samplesPerWave - waveIndex
        }
      })
    })

    offset += bufferSize
  })
}

const squareSample = (index, samplesPerWave, multiplier = 1.0) => {
  return (index <= parseInt(samplesPerWave / 2) ? 0.5 : -0.5) * multiplier
}

const fuzzSample = (index, samplesPerWave, multiplier = 1.0) => {
  return (index <= parseInt(samplesPerWave / 2) ? Math.random() : Math.random() - 1) * multiplier
}

const triangleSample = (index, samplesPerWave, multiplier = 1.0) => {
  const halfSamples = parseInt(samplesPerWave / 2)
  const quarterSamples = parseInt(samplesPerWave / 4)
  const ramp = 1.0 / quarterSamples

  if (index <= halfSamples) {
    if (index <= quarterSamples) {
      return index * ramp * multiplier
    } else {
      return (halfSamples - index) * ramp * multiplier
    }
  } else {
    if (index <= halfSamples + quarterSamples) {
      return -((index - halfSamples) * ramp) * multiplier
    } else {
      return -((samplesPerWave - index) * ramp) * multiplier
    }
  }
}

const sineSample = (index, samplesPerWave, multiplier = 1.0) => {
  return Math.sin(index / (samplesPerWave / (Math.PI * 2))) * multiplier
}

let timerId
let timerStart
let lastPlayheadPhrase
let lastPlayheadIndex
let sequenceIndex
let phraseIndex
let lastSequenceIndex

const highlightColumn = () => {
  const elapsedTime = Date.now() - timerStart
  const millis = elapsedTime % totalMillis

  sequenceIndex = timeStops.findIndex(n => millis < n)
  phraseIndex = sequence[sequenceIndex] - 1

  const index = Math.floor((millis - (timeStops[sequenceIndex - 1] || 0)) / millisPer16ths[sequenceIndex]) % 16

  if (lastPlayheadIndex !== index || lastPlayheadPhrase !== phraseIndex) {
    if (lastPlayheadIndex !== null && lastPlayheadIndex !== undefined) {
      columns[lastPlayheadPhrase][lastPlayheadIndex].forEach(td => {
        td.classList.remove("tan")
      })
    }

    columns[phraseIndex][index].forEach(td => {
      td.classList.add("tan")
    })


    if (lastSequenceIndex !== sequenceIndex) {
      sequenceSelects[sequenceIndex].classList.add('tan')

      if (lastSequenceIndex !== null && lastSequenceIndex !== undefined) {
        sequenceSelects[lastSequenceIndex].classList.remove('tan')
      }
    }

    lastPlayheadPhrase = phraseIndex
    lastPlayheadIndex = index
    lastSequenceIndex = sequenceIndex
  }
}

const play = () => {
  stop()
  bufferSource = audioCtx.createBufferSource()
  bufferSource.connect(audioCtx.destination)
  bufferSource.buffer = buffer
  bufferSource.onended = () => {
    playing = false
    finishTimer()
  }
  playing = true
  timerId = setInterval(highlightColumn, 50)
  timerStart = Date.now()
  bufferSource.start()
}

const finishTimer = () => {
  clearInterval(timerId)

  timerId = null
  timerStart = null

  forEach(document.querySelectorAll('td'), (i, td) => td.classList.remove('tan'))
  forEach(document.querySelectorAll('select.step'), (i, s) => s.classList.remove('tan'))

  lastPlayheadPhrase = null
  lastPlayheadIndex = null
  lastSequenceIndex = null
}

const stop = () => {
  if (!!bufferSource) {
    try {
      bufferSource.stop()
      finishTimer()
    } catch (e) {}
  }
}
