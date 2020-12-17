const toneConstant = 1.059463
const bpms = []
const notes = [[]]
const sampleRate = 22050
const pData = [[]]
const tones = [[]]
const rootNotes = [[]]
const octaves = [[]]
const noteLengths = [[]]
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

let columns = []
let playing = false
let audioCtx = new (window.AudioContext || window.webkitAudioContext)()
let buffer
let bufferSource
let bufferSizes = []

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
      const trs = table.querySelectorAll(':scope tbody tr')

      forEach(trs, (i, tr) => {
        const tds = tr.querySelectorAll(':scope td')

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
    loop()
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
}

const changeRoot = (e) => {
  const note = e.target.value
  const indexStr = e.target.id.slice(4)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const pIndex = indicies[0]
  const index = indicies[1]

  setNoteText(pIndex, index, note)

  rootNotes[pIndex][index] = note

  history.replaceState(null, '', '?p=' + encodeAll())
  generateNotes(pIndex, index)
  paintAll()
  generateSound()
}

const setNoteText = (pIndex, index, note) => {
  const newNotes = generateNoteNames(note)
  const table = document.querySelector(`#chart${pIndex}-${index}`)
  const trs = table.querySelectorAll(':scope tr')

  forEach(trs, (rowIndex, tr) => {
    const firstTd = tr.querySelector('td')

    if (rowIndex < newNotes.length) {
      firstTd.innerText = newNotes[rowIndex]
    } else {
      firstTd.innerText = newNotes[0]
    }
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

  let rootValue = noteNamesAndFreqs[rootNotes[pIndex][index]]
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
  const indexStr = parseInt(e.target.id.slice(6))
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const pIndex = indicies[0]
  const index = indicies[1]

  if (pData[pIndex] <= 1) {
    return
  }

  document.querySelector(`#container${pIndex}-${index}`).remove()

  pData[pIndex].splice(index, 1)
  tones[pIndex].splice(index, 1)
  rootNotes[pIndex].splice(index, 1)
  octaves[pIndex].splice(index, 1)
  noteLengths[pIndex].splice(index, 1)
  notes[pIndex].splice(index, 1)

  while (index < pData[pIndex].length) {
    let cont = document.querySelector(`#container${pIndex}-${index + 1}`)
    let tab = cont.querySelector(`#chart${pIndex}-${index + 1}`)
    let del = cont.querySelector('button.delete')
    let lis = cont.querySelector('select.tone')
    let roo = cont.querySelector('select.root')
    let oct = cont.querySelector('select.octave')
    let ntl = cont.querySelector('select.notelength')

    cont.id = `container${pIndex}-${index}`
    tab.id = `chart${pIndex}-${index}`
    del.id = `delete${pIndex}-${index}`
    lis.id = `inst${pIndex}-${index}`
    roo.id = `root${pIndex}-${index}`
    oct.id = `octave${pIndex}-${index}`
    ntl.id = `notelength${pIndex}-${index}`

    index++
  }

  assignCellClicks()
  generateSound()
  history.replaceState(null, '', '?p=' + encodeAll())
}

const createChart = (e) => {
  const pIndex = parseInt(e.target.id.slice(3))
  const proto = document.querySelector("div.proto")
  const body = document.querySelector('body')
  const chartIndex = pData[pIndex].length

  let phraseContainer = document.querySelector(`#phrase${pIndex}`)
  let chartContainer = proto.cloneNode(true)
  let chart = chartContainer.querySelector('table')
  let deleteButton = chartContainer.querySelector('button.delete')
  let lis = chartContainer.querySelector('select.tone')
  let roo = chartContainer.querySelector('select.root')
  let oct = chartContainer.querySelector('select.octave')
  let ntl = chartContainer.querySelector('select.notelength')

  chartContainer.classList.remove('proto')
  chartContainer.id = `container${pIndex}-${chartIndex}`
  chart.className = 'pattern'
  chart.id = `chart${pIndex}-${chartIndex}`
  deleteButton.id = `delete${pIndex}-${chartIndex}`
  deleteButton.onclick = (e) => deleteChart(e)
  lis.id = `inst${pIndex}-${chartIndex}`
  lis.onchange = (e) => changeTone(e)
  roo.id = `root${pIndex}-${chartIndex}`
  roo.onchange = (e) => changeRoot(e)
  oct.id = `octave${pIndex}-${chartIndex}`
  oct.onchange = (e) => changeOctave(e)
  ntl.id = `notelength${pIndex}-${chartIndex}`
  ntl.onchange = (e) => changeNoteLength(e)

  phraseContainer.appendChild(chartContainer)

  pData[pIndex][chartIndex] = []
  tones[pIndex][chartIndex] = 1
  rootNotes[pIndex][chartIndex] = 'C'
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
}

const createCharts = () => {
  const proto = document.querySelector("div.proto")
  const body = document.querySelector('body')

  pData.forEach(phrase => {
    if (phrase.length === 0) {
      phrase[0] = []
    }
  })

  pData.forEach((phrase, pIndex) => {
    let phraseContainer = document.createElement('div')
    phraseContainer.className = 'phrase'
    phraseContainer.id = `phrase${pIndex}`

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
    bpm.onchange = (e) => {
      changeTempo(e)
    }

    bpmContainer.appendChild(bpmLabel)
    bpmContainer.appendChild(bpm)
    phraseContainer.appendChild(bpmContainer)

    phrase.forEach((_, chartIndex) => {
      let chartContainer = proto.cloneNode(true)
      let chart = chartContainer.querySelector('table')
      let deleteButton = chartContainer.querySelector('button.delete')
      let lis = chartContainer.querySelector('select.tone')
      let roo = chartContainer.querySelector('select.root')
      let oct = chartContainer.querySelector('select.octave')
      let ntl = chartContainer.querySelector('select.notelength')

      chartContainer.classList.remove('proto')
      chartContainer.id = `container${pIndex}-${chartIndex}`
      chart.className = 'pattern'
      chart.id = `chart${pIndex}-${chartIndex}`
      deleteButton.id = `delete${pIndex}-${chartIndex}`
      deleteButton.onclick = (e) => deleteChart(e)
      lis.id = `inst${pIndex}-${chartIndex}`
      lis.onchange = (e) => changeTone(e)
      roo.id = `root${pIndex}-${chartIndex}`
      roo.onchange = (e) => changeRoot(e)
      oct.id = `octave${pIndex}-${chartIndex}`
      oct.onchange = (e) => changeOctave(e)
      ntl.id = `notelength${pIndex}-${chartIndex}`
      ntl.onchange = (e) => changeNoteLength(e)

      phraseContainer.appendChild(chartContainer)
    })

    let add = document.createElement('div')
    add.className = 'add'
    add.id = `add${pIndex}`
    add.onclick = createChart
    add.innerText = '+'

    phraseContainer.appendChild(add)

    body.insertBefore(phraseContainer, proto)
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
  pData.forEach((phrase, pIndex) => {
    rootNotes[pIndex].forEach((root, index) => {
      let r = document.querySelector(`#root${pIndex}-${index}`)
      r.value = root
      setNoteText(pIndex, index, root)
    })
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

const init = () => {
  const params = (new URL(document.location)).searchParams
  const phraseParam = params.get('p')

  if (phraseParam !== null && phraseParam !== undefined) {
    const phrases = phraseParam.split('|')

    phrases.forEach((phrasePatterns, pIndex) => {
      const patterns = phrasePatterns.split(';')

      patterns.forEach((pattern, index) => {
        pData[pIndex][index] = []

        if (!!pattern) {
          bpms[pIndex] = parseInt(pattern.slice(0, 2), 16)
          const tone = parseInt(pattern[2])
          const rootNote = Object.keys(noteNamesAndFreqs)[parseInt(pattern[3], 16)]
          const octave = parseInt(pattern[4])
          const noteLength = parseFloat([0.25, 0.5, 0.75, 1.0][parseInt(pattern[5])])

          tones[pIndex][index] = tone
          rootNotes[pIndex][index] = rootNote
          octaves[pIndex][index] = octave
          noteLengths[pIndex][index] = noteLength
          generateNotes(pIndex, index)

          if (pattern.length > 6) {
            pattern.slice(6)
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
    bpms[0] = 110
    tones[0][0] = 1
    rootNotes[0][0] = 'C'
    octaves[0][0] = 3
    noteLengths[0][0] = 1.0
    generateNotes(0, 0)
  }

  createCharts()
  assignCellClicks()
  paintAll()
  setInsts()
  setRoots()
  setOctaves()
  setNoteLengths()
  generateSound()

  document.onkeydown = (e) => {
    if (e.code === "Space") {
      e.preventDefault()

      if (playing) {
        stop()
      } else {
        loop()
      }
    }
  }
}

const assignCellClicks = () => {
  const phrases = document.querySelectorAll('.phrase')

  forEach(phrases, (_, phrase) => {
    const pIndex = parseInt(phrase.id.slice(6))
    const tables = phrase.querySelectorAll(':scope table')

    forEach(tables, (_, table) => {
      const trs = table.querySelectorAll(':scope tr')
      const tableIndex = parseInt(table.id.slice(5))

      forEach(trs, (rowIndex, tr) => {
        const tds = tr.querySelectorAll(':scope td')

        forEach(tds, (dataIndex, td) => {
          td.onclick = (e) => {
            if (pData[pIndex][tableIndex][dataIndex] === rowIndex)
              pData[pIndex][tableIndex][dataIndex] = null
            else
              pData[pIndex][tableIndex][dataIndex] = rowIndex

            history.replaceState(null, '', '?p=' + encodeAll())
            paintAll()
            generateSound()
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
  link.download = "loop.wav"
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

const encodeAll = () => {
  let beatString = ''

  pData.forEach((phrase, pIndex) => {
    phrase.forEach((data, index) => {
      beatString = beatString.concat(bpms[pIndex].toString(16).toUpperCase().padStart(2, '0'))
      beatString = beatString.concat(tones[pIndex][index])
      beatString = beatString.concat(Object.keys(noteNamesAndFreqs).indexOf(rootNotes[pIndex][index]).toString(16))
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

  pData.forEach((phrase, pIndex) => {
    let pbpm = bpms[pIndex]
    let beatsPerSecond = pbpm / 60.0
    let secondsPerBeat = 1.0 / beatsPerSecond
    let seconds = secondsPerBeat * beatsPerMeasure
    let phraseBufferSize = parseInt(seconds * sampleRate)
    bufferSizes[pIndex] = phraseBufferSize

    bSize += phraseBufferSize
  })

  console.log(bSize)
  buffer = audioCtx.createBuffer(1, bSize, sampleRate)

  generateTones()
  prepareDownload()
  gatherColumns()
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
      const trs = table.querySelectorAll(':scope tbody tr')

      forEach(trs, (k, tr) => {
        const tds = tr.querySelectorAll(':scope td')

        forEach(tds, (l, td) => {
          columns[i][j].push(td)
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

  pData.forEach((phrase, pIndex) => {
    let subBufferSize = bufferSizes[pIndex]

    phrase.forEach((beatData, chartIndex) => {
      let lastIndex = -1

      beatData.forEach((noteIndex, beatIndex) => {
        if (noteIndex !== null && noteIndex !== undefined) {
          let bufferPointer = offset + beatIndex * subBufferSize // start of the "16th" subsection
          let localIndex = 0

          if (lastIndex === beatIndex - 1 && noteLengths[pIndex][chartIndex] === 1.0) {
            while (carryover > 0) {
              const value = waveFunction(tones[pIndex][chartIndex])(waveIndex, samplesPerWave, 1)

              buffering[bufferPointer + localIndex] = value

              localIndex++
              waveIndex++
              carryover--
            }
          }

          waveIndex = 0
          freq = notes[pIndex][chartIndex][noteIndex]
          samplesPerWave = parseInt(sampleRate / freq)

          while (localIndex < subBufferSize) {
            let value = buffering[bufferPointer + localIndex] || 0.0
            let waveMulti = waveMultiplier(localIndex, subBufferSize, noteLengths[pIndex][chartIndex])
            let sample = waveFunction(tones[pIndex][chartIndex])(waveIndex, samplesPerWave, waveMulti)

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

          carryover = samplesPerWave - waveIndex

          const noNextBeat = beatData[beatIndex + 1] === null || beatData[beatIndex + 1] === undefined 

          if (noNextBeat || noteLengths[pIndex][chartIndex] < 1.0) {
            buffering[bufferPointer + localIndex - 1] = 0
          }
        }
      })
    })

    offset += subBufferSize
  })


  // zero out ~220 at end of buffer? 220 = 10 ms at 22050 sample rate
  // for (let i = buffering.length - 1; i > buffering.length - 221; i--) {
  //   buffering[i] = 0.0
  // }
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
let millisPer16th // = (seconds / 16) * 1000
let interval // = Math.floor(millisPer16th)
let lastPlayheadPhrase
let lastPlayheadIndex

const highlightColumn = () => {
  const elapsedTime = Date.now() - timerStart

  // calculate these wrt multiple phrases
  const index = Math.floor(elapsedTime / interval) % 16
  const pIndex = '?'

  if (lastPlayheadIndex !== index) {
    if (lastPlayheadIndex !== null && lastPlayheadIndex !== undefined) {
      columns[pIndex][lastPlayheadIndex].forEach(td => {
        td.classList.remove("tan")
      })
    }

    columns[pIndex][index].forEach(td => {
      td.classList.add("tan")
    })

    lastPlayheadPhrase = pIndex
    lastPlayheadIndex = index
  }
}

const loop = () => {
  stop()
  bufferSource = audioCtx.createBufferSource()
  bufferSource.connect(audioCtx.destination)
  bufferSource.buffer = buffer
  bufferSource.onended = () => { playing = false }
  bufferSource.loop = true
  playing = true
  // timerId = setInterval(highlightColumn, interval)
  // timerStart = Date.now()
  bufferSource.start()
}

const stop = () => {
  if (!!bufferSource) {
    try {
      bufferSource.stop()

      // clearInterval(timerId)
      // timerId = null
      // timerStart = null

      // columns[lastPlayheadPhrase][lastPlayheadIndex].forEach(td => {
      //   td.classList.remove("tan")
      // })

      // lastPlayheadPhrase = null
      // lastPlayheadIndex = null
    } catch (e) {}
  }
}
