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
let volumes
let pans
let noteLengths
let sequence
let columns
let playing = false
let audioCtx = new (window.AudioContext || window.webkitAudioContext)()
let buffer
let bufferSource
let bufferSizes = []
let timeStops
let millisPer16ths
let totalMillis
let sampleNotes
let sequenceSelects
let phraseBuffers = []
let playButton

unmute(audioCtx)

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
    phrase.forEach((grid, index) => {
      const table = document.querySelector(`#grid${pIndex}-${index}`)
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

  generateSound(pIndex)

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
  generateSound(pIndex)
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
  generateSound(pIndex)
  generateSampleTones()
}

const changeVolume = (e) => {
  const indexStr = e.target.id.slice(6)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const pIndex = indicies[0]
  const index = indicies[1]

  volumes[pIndex][index] = parseFloat(e.target.value)

  paintAll()
  generateSound(pIndex)
  generateSampleTones()

  history.replaceState(null, '', '?p=' + encodeAll())
}

const changePan = (e) => {
  const indexStr = e.target.id.slice(3)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const pIndex = indicies[0]
  const index = indicies[1]

  pans[pIndex][index] = parseInt(e.target.value)

  paintAll()
  generateSound(pIndex)
  generateSampleTones()

  history.replaceState(null, '', '?p=' + encodeAll())
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
  generateSound(pIndex)
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
  generateSound(pIndex)
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
  volumes[pIndex].splice(index, 1)
  pans[pIndex].splice(index, 1)
  notes[pIndex].splice(index, 1)

  while (index < pData[pIndex].length) {
    let cont = document.querySelector(`#container${pIndex}-${index + 1}`)
    let tab = cont.querySelector(`#grid${pIndex}-${index + 1}`)
    let del = cont.querySelector('button.delete')
    let lis = cont.querySelector('select.tone')
    let oct = cont.querySelector('select.octave')
    let ntl = cont.querySelector('select.notelength')
    let vol = cont.querySelector('select.volume')
    let pan = cont.querySelector('select.pan')

    cont.id = `container${pIndex}-${index}`
    tab.id = `grid${pIndex}-${index}`
    del.id = `delete${pIndex}-${index}`
    lis.id = `inst${pIndex}-${index}`
    oct.id = `octave${pIndex}-${index}`
    ntl.id = `notelength${pIndex}-${index}`
    vol.id = `volume${pIndex}-${index}`
    pan.id = `pan${pIndex}-${index}`

    index++
  }

  assignCellClicks()
  generateSound(pIndex)
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

  bpmContainer.appendChild(phraseNo)
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
  volumes[pIndex] = []
  pans[pIndex] = []
  notes[pIndex] = []
  bpms[pIndex] = bpms[pIndex - 1]
  remakeSequenceSelects()
  createChart({target: {id: `add${pIndex}`}})
}

const createChart = (e) => {
  const pIndex = parseInt(e.target.id.slice(3))
  const proto = document.querySelector("div.proto")
  const phrases = document.querySelector('.phrases')
  const gridIndex = pData[pIndex].length

  let phraseContainer = document.querySelector(`#phrase${pIndex}`)
  let gridContainer = proto.cloneNode(true)
  let grid = gridContainer.querySelector('table')
  let deleteButton = gridContainer.querySelector('button.delete')
  let lis = gridContainer.querySelector('select.tone')
  let oct = gridContainer.querySelector('select.octave')
  let ntl = gridContainer.querySelector('select.notelength')
  let add = phraseContainer.querySelector(`#add${pIndex}`)
  let vol = gridContainer.querySelector('select.volume')
  let pan = gridContainer.querySelector('select.pan')

  gridContainer.classList.remove('proto')
  gridContainer.id = `container${pIndex}-${gridIndex}`
  grid.className = 'grid'
  grid.id = `grid${pIndex}-${gridIndex}`
  deleteButton.id = `delete${pIndex}-${gridIndex}`
  deleteButton.onclick = deleteChart
  lis.id = `inst${pIndex}-${gridIndex}`
  lis.onchange = changeTone
  oct.id = `octave${pIndex}-${gridIndex}`
  oct.onchange = changeOctave
  ntl.id = `notelength${pIndex}-${gridIndex}`
  ntl.onchange = changeNoteLength
  vol.id = `volume${pIndex}-${gridIndex}`
  vol.onchange = changeVolume
  pan.id = `pan${pIndex}-${gridIndex}`
  pan.onchange = changePan

  phraseContainer.insertBefore(gridContainer, add)

  pData[pIndex][gridIndex] = []
  tones[pIndex][gridIndex] = 1
  octaves[pIndex][gridIndex] = 3
  noteLengths[pIndex][gridIndex] = 1.0
  volumes[pIndex][gridIndex] = 1.0
  pans[pIndex][gridIndex] = 2
  generateNotes(pIndex, gridIndex)
  paintAll()
  setInsts()
  setRoots()
  setOctaves()
  setNoteLengths()
  assignCellClicks()
  generateSound(pIndex)
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
  if (pData.length === 1)
    return

  let pIndex = parseInt(e.target.id.slice(9))
  let parts = encodeAll().split('|')

  parts.splice(pIndex + 1, 1) // account for "sequence" data at position 0 of url parts
  parts[0] = parts[0].replaceAll(pIndex + 1, '') // remove from sequence too
  parts[0] = parts[0].split('')
                     .map(n => parseInt(n))
                     .filter(n => n !== pIndex + 1)
                     .map(n => n > pIndex + 1 ? n - 1 : n)
                     .join('')
  if (!parts[0])
    parts[0] = '1'

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

    bpmContainer.appendChild(phraseNo)
    bpmContainer.appendChild(bpmLabel)
    bpmContainer.appendChild(bpm)
    bpmContainer.appendChild(keyLabel)
    bpmContainer.appendChild(keySelect)
    bpmContainer.appendChild(dupButton)
    bpmContainer.appendChild(delButton)
    phraseContainer.appendChild(bpmContainer)

    phrase.forEach((_, gridIndex) => {
      let gridContainer = proto.cloneNode(true)
      let grid = gridContainer.querySelector('table')
      let deleteButton = gridContainer.querySelector('button.delete')
      let lis = gridContainer.querySelector('select.tone')
      let oct = gridContainer.querySelector('select.octave')
      let ntl = gridContainer.querySelector('select.notelength')
      let vol = gridContainer.querySelector('select.volume')
      let pan = gridContainer.querySelector('select.pan')

      gridContainer.classList.remove('proto')
      gridContainer.id = `container${pIndex}-${gridIndex}`
      grid.className = 'grid'
      grid.id = `grid${pIndex}-${gridIndex}`
      deleteButton.id = `delete${pIndex}-${gridIndex}`
      deleteButton.onclick = deleteChart
      lis.id = `inst${pIndex}-${gridIndex}`
      lis.onchange = changeTone
      oct.id = `octave${pIndex}-${gridIndex}`
      oct.onchange = changeOctave
      ntl.id = `notelength${pIndex}-${gridIndex}`
      ntl.onchange = changeNoteLength
      vol.id = `volume${pIndex}-${gridIndex}`
      vol.onchange = changeVolume
      pan.id = `pan${pIndex}-${gridIndex}`
      pan.onchange = changePan

      phraseContainer.appendChild(gridContainer)
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

const setVolumes = () => {
  pData.forEach((phrase, pIndex) => {
    volumes[pIndex].forEach((volume, index) => {
      let v = document.querySelector(`#volume${pIndex}-${index}`)
      v.value = volume.toString()
    })
  })
}

const setPans = () => {
  pData.forEach((phrase, pIndex) => {
    pans[pIndex].forEach((pan, index) => {
      let p = document.querySelector(`#pan${pIndex}-${index}`)
      p.value = pan
    })
  })
}

const changeSequence = (e) => {
  let index = parseInt(e.target.id.slice(4))

  if (e.target.value === '-') {
    if (index < sequence.length) {
      sequence = sequence.slice(0, index)
    }
  } else {
    sequence[index] = parseInt(e.target.value)
  }

  remakeSequenceSelects()
  generateSequence(true)
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
  volumes = []
  pans = []
  sequence = []

  const params = (new URL(document.location)).searchParams
  const phraseParam = params.get('p')

  if (phraseParam !== null && phraseParam !== undefined) {
    const phrases = phraseParam.split('|')

    sequence = phrases.shift().split('').map(n => parseInt(n, 16))
    
    if (!sequence.length) // if empty sequence, default to [1]
      sequence = [1]

    phrases.forEach((phrasePatterns, pIndex) => {
      const patterns = phrasePatterns.split(';')

      const pattern = patterns.shift()
      bpms[pIndex] = parseInt(pattern.slice(0, 2), 16)
      rootNotes[pIndex] = Object.keys(noteNamesAndFreqs)[parseInt(pattern[2], 16)]
      pData[pIndex] = []
      tones[pIndex] = []
      octaves[pIndex] = []
      noteLengths[pIndex] = []
      volumes[pIndex] = []
      pans[pIndex] = []
      notes[pIndex] = []

      patterns.forEach((pattern, index) => {
        pData[pIndex][index] = []

        if (!!pattern) {
          const tone = parseInt(pattern[0])
          const octave = parseInt(pattern[1])
          const noteLength = parseFloat([0.25, 0.5, 0.75, 1.0][parseInt(pattern[2])])
          const volume     = parseFloat([0.25, 0.5, 0.75, 1.0][parseInt(pattern[3])])
          const pan = parseInt(pattern[4])

          tones[pIndex][index] = tone
          octaves[pIndex][index] = octave
          noteLengths[pIndex][index] = noteLength
          volumes[pIndex][index] = volume
          pans[pIndex][index] = pan
          generateNotes(pIndex, index)

          if (pattern.length > 5) {
            pattern.slice(5)
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
    volumes[0] = [1.0]
    pans[0] = [2]
    notes[0] = []
    generateNotes(0, 0)
  }

  createCharts()
  assignCellClicks()
  paintAll()
  setInsts()
  setRoots()
  setOctaves()
  setVolumes()
  setPans()
  remakeSequenceSelects()
  setNoteLengths()
  generateSound(null, true)
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

  playButton = document.querySelector('#play')
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

              let bufferSource = audioCtx.createBufferSource()
              bufferSource.connect(audioCtx.destination)
              bufferSource.buffer = sampleTones[pIndex][tableIndex][rowIndex]
              bufferSource.start()
            }

            paintAll()
            generateSound(pIndex)
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
    beatString = beatString.concat([0.25, 0.5, 0.75, 1.0].indexOf(volumes[pIndex][index]))
    beatString = beatString.concat(pans[pIndex][index])

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
      beatString = beatString.concat([0.25, 0.5, 0.75, 1.0].indexOf(volumes[pIndex][index]))
      beatString = beatString.concat(pans[pIndex][index])

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

const generateSound = (pIndex, sequenceChanged=false) => {
  generatePhraseBuffers(pIndex)
  generateSequence(sequenceChanged)
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
      const table = document.querySelector(`#grid${i}-${j}`)
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

const generateSampleTones = () => {
  sampleTones = []

  for (let i = 0; i < pData.length; i++) {
    sampleTones[i] = []

    let bufferSize = bufferSizes[i]
    let subBufferSize = Math.round(bufferSize / 16) // just doing 16th notes in 4/4 FOR NOW

    for (let j = 0; j < notes[i].length; j++) {
      sampleTones[i][j] = []

      for (let k = 0; k < notes[i][j].length; k++) {
        let someArray = []
        let freq = notes[i][j][k]
        let samplesPerWave = parseInt(sampleRate / freq)
        let localIndex = 0
        let waveIndex = 0
        let lengthOffset = (1.0 - noteLengths[i][j]) * subBufferSize

        while (localIndex + lengthOffset < subBufferSize) {
          let sample = waveFunction(tones[i][j])(waveIndex, samplesPerWave)

          sample = sample * volumes[i][j]

          if (sample > 1.0)
            sample = 1.0
          else if (sample < -1.0)
            sample = -1.0

          someArray[localIndex] = sample

          waveIndex++
          localIndex++

          if (waveIndex >= samplesPerWave) waveIndex = 0
        }

        let carryover = 0

        while (waveIndex < samplesPerWave) {
          let sample = waveFunction(tones[i][j])(waveIndex, samplesPerWave)

          sample = sample * volumes[i][j]

          if (sample > 1.0)
            sample = 1.0
          else if (sample < -1.0)
            sample = -1.0

          someArray[localIndex] = sample

          localIndex++
          waveIndex++
          carryover++
        }

        let realBufferSize = subBufferSize + carryover
        let buffer = audioCtx.createBuffer(1, realBufferSize, sampleRate)
        let buffering = buffer.getChannelData(0)

        for (let m = 0; m < realBufferSize; m++) {
          buffering[m] = someArray[m]
        }

        sampleTones[i][j][k] = buffer
      }
    }
  }
}

const generatePhraseBuffers = (specificPhrase) => {
  let beatsPerMeasure = 4
  let specificPhraseWanted = specificPhrase !== null && specificPhrase !== undefined

  pData.forEach((phrase, pIndex) => {
    if (specificPhraseWanted && specificPhrase !== pIndex)
      return

    let pbpm = bpms[pIndex]
    let beatsPerSecond = pbpm / 60.0
    let secondsPerBeat = 1.0 / beatsPerSecond
    let seconds = secondsPerBeat * beatsPerMeasure
    let bufferSize = parseInt(seconds * sampleRate)
    let subBufferSize = Math.round(bufferSize / 16) // just doing 16th notes in 4/4 FOR NOW
    let lastIndex = -1
    let carryover = 0
    let someArray = Array(bufferSize).fill(0.0)

    phrase.forEach((phraseData, gridIndex) => {
      phraseData.forEach((noteIndex, beatIndex) => {
        if (noteIndex !== null && noteIndex !== undefined) {
          let bufferPointer = beatIndex * subBufferSize // start of the "16th" subsection
          let localIndex = beatIndex === lastIndex + 1 ? carryover : 0
          let waveIndex = 0
          let lengthOffset = (1.0 - noteLengths[pIndex][gridIndex]) * subBufferSize

          freq = notes[pIndex][gridIndex][noteIndex]
          samplesPerWave = parseInt(sampleRate / freq)

          while (localIndex + lengthOffset < subBufferSize) {
            let value = someArray[bufferPointer + localIndex] || 0.0
            let sample = waveFunction(tones[pIndex][gridIndex])(waveIndex, samplesPerWave)

            sample = sample * volumes[pIndex][gridIndex]

            value += sample

            if (value > 1.0)
              value = 1.0
            else if (value < -1.0)
              value = -1.0

            someArray[bufferPointer + localIndex] = value

            waveIndex++
            localIndex++
            lastIndex = beatIndex
            lastSample = sample

            if (waveIndex >= samplesPerWave) waveIndex = 0
          }

          carryover = 0

          while (waveIndex < samplesPerWave) {
            let value = someArray[bufferPointer + localIndex] || 0.0
            let sample = waveFunction(tones[pIndex][gridIndex])(waveIndex, samplesPerWave)

            sample = sample * volumes[pIndex][gridIndex]

            value += sample

            if (value > 1.0)
              value = 1.0
            else if (value < -1.0)
              value = -1.0

            someArray[bufferPointer + localIndex] = value

            localIndex++
            waveIndex++
            carryover++
          }

          lastIndex = beatIndex
        }
      })

      bufferSizes[pIndex] = someArray.length

      let buffer = audioCtx.createBuffer(1, someArray.length, sampleRate)
      let buffering = buffer.getChannelData(0)

      for (let m = 0; m < someArray.length; m++) {
        buffering[m] = someArray[m]
      }

      phraseBuffers[pIndex] = buffer
    })
  })
}

const generateSequence = (sequenceChanged=false) => {
  let offset = 0
  let beatsPerMeasure = 4
  let buffering

  timeStops = []
  millisPer16ths = []
  totalMillis = 0

  if (sequenceChanged) {
    let len = sequence.reduce((acc, seqNo) => acc = acc + phraseBuffers[seqNo - 1].length, 0)
    buffer = audioCtx.createBuffer(1, len, sampleRate)
  }

  buffering = buffer.getChannelData(0)

  if (!sequenceChanged) {
    for (let i = 0; i < buffering.length; i++) {
      buffering[i] = 0.0
    }
  }

  sequence.forEach((seqNo, index) => {
    let pIndex = seqNo - 1
    let pbpm = bpms[pIndex]
    let beatsPerSecond = pbpm / 60.0
    let secondsPerBeat = 1.0 / beatsPerSecond
    let seconds = secondsPerBeat * beatsPerMeasure
    let millis = Math.round(seconds * 1000)
    let interval = Math.round(millis / 16)

    let bufferSize = bufferSizes[pIndex]
    let phraseBuffer = phraseBuffers[pIndex]
    let phraseBuffering = phraseBuffer.getChannelData(0)

    totalMillis += millis
    timeStops[index] = totalMillis
    millisPer16ths[index] = interval

    for (let i = 0; i < phraseBuffering.length; i++) {
      buffering[offset + i] = phraseBuffering[i]
    }

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
    playButton.innerText = 'play'
    playButton.onclick = play
  }
  playing = true
  timerId = setInterval(highlightColumn, 50)
  timerStart = Date.now()
  bufferSource.start()
  playButton.innerText = 'stop'
  playButton.onclick = stop
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
      playButton.innerText = 'play'
      playButton.onclick = play
    } catch (e) {}
  }
}
