let audioCtx
let bufferSource
let nowPlaying = null // id of the qwel that is currently playing
let afterStop = null // callback to do work after bufferSource "onended" callback triggers

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

const forEach = (array, callback, scope) => {
  for (let i = 0; i < array.length; i++) {
    callback.call(scope, i, array[i])
  }
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

const generateNoteFrequency = (multiplier, root) => {
  let val = root

  for (let i = 0; i < multiplier; i++) {
    val = val * toneConstant
  }

  return parseInt(val)
}

const generateNotes = (octave, rootNote) => {
  let notes = []
  let octaveShift = Math.pow(toneConstant, 12)
  let octaveShiftCount = 0

  if (octave < 4) {
    octaveShift = 1 / Math.pow(toneConstant, 12)
    octaveShiftCount = 4 - octave
  } else if (octave > 4) {
    octaveShiftCount = octave - 4
  }

  let rootValue = noteNamesAndFreqs[rootNote]
  for (let i = 0; i < octaveShiftCount; i++) {
    rootValue = rootValue * octaveShift 
  }

  notes[12] = rootValue

  for (let i = 12; i >= 0; i--) {
    notes[12 - i] = generateNoteFrequency(i, rootValue)
  }

  return notes;
}

const parse = (rep, id) => {
  let data = {}
  data.phrases = []

  const phrases = rep.split('|')

  data.name = decodeURIComponent(phrases.shift())
  data.sequence = phrases.shift().match(/.{1,2}/g).map(n => parseInt(n, 16))
  
  phrases.forEach((phrasePatterns, pIndex) => {
    let phrase = {
      id: id
    }

    phrase.grids = []

    const patterns = phrasePatterns.split(';')
    const pattern = patterns.shift()

    phrase.bpm = parseInt(pattern.slice(0, 2), 16)
    phrase.rootNote = Object.keys(noteNamesAndFreqs)[parseInt(pattern[2], 16)]

    patterns.forEach((pattern, index) => {
      let grid = {}

      if (!!pattern) {
        grid.tone = parseInt(pattern[0])
        grid.octave = parseInt(pattern[1])
        grid.noteLength = parseFloat([0.25, 0.5, 0.75, 1.0][parseInt(pattern[2])])
        grid.volume     = parseFloat([0.25, 0.5, 0.75, 1.0][parseInt(pattern[3])])
        grid.pan = parseInt(pattern[4])
        grid.notes = generateNotes(grid.octave, phrase.rootNote)
        grid.pattern = []

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
            grid.pattern[columnIndex] = noteIndex
          })
        }
      }

      phrase.grids.push(grid)
    })
    
    data.phrases.push(phrase)
  })

  return data
}

// { buffer, totalMillis, timeStops, millisPer16ths, sequence: phraseData.sequence }
const generateSound = (data) => {
  return generateSequence(data, generatePhraseBuffers(data))
}

const generatePhraseBuffers = (data) => {
  let phraseBuffers = []
  let bufferSizes = []
  let beatsPerMeasure = 4

  data.phrases.forEach((phrase, pIndex) => {
    let beatsPerSecond = phrase.bpm / 60.0
    let secondsPerBeat = 1.0 / beatsPerSecond
    let seconds = secondsPerBeat * beatsPerMeasure
    let bufferSize = parseInt(seconds * sampleRate)
    let subBufferSize = Math.round(bufferSize / 16) // just doing 16th notes in 4/4 FOR NOW
    let lastIndex = -1
    let carryover = 0
    let someArrayL = Array(bufferSize).fill(0.0)
    let someArrayR = Array(bufferSize).fill(0.0)

    phrase.grids.forEach((gridData, gridIndex) => {
      gridData.pattern.forEach((noteIndex, beatIndex) => {
        if (noteIndex !== null && noteIndex !== undefined) {
          let bufferPointer = beatIndex * subBufferSize // start of the "16th" subsection
          let localIndex = beatIndex === lastIndex + 1 ? carryover : 0
          let waveIndex = 0
          let lengthOffset = (1.0 - gridData.noteLength) * subBufferSize

          freq = gridData.notes[noteIndex]
          samplesPerWave = parseInt(sampleRate / freq)

          while (localIndex + lengthOffset < subBufferSize) {
            let valueL = someArrayL[bufferPointer + localIndex] || 0.0
            let valueR = someArrayR[bufferPointer + localIndex] || 0.0
            let sampleL = waveFunction(gridData.tone)(waveIndex, samplesPerWave)
            let sampleR = waveFunction(gridData.tone)(waveIndex, samplesPerWave)

            sampleL = sampleL * gridData.volume * (1 - gridData.pan / 4)
            sampleR = sampleR * gridData.volume * (gridData.pan / 4)

            valueL += sampleL
            valueR += sampleR

            if (valueL > 1.0)
              valueL = 1.0
            else if (valueL < -1.0)
              valueL = -1.0

            if (valueR > 1.0)
              valueR = 1.0
            else if (valueR < -1.0)
              valueR = -1.0

            someArrayL[bufferPointer + localIndex] = valueL
            someArrayR[bufferPointer + localIndex] = valueR

            waveIndex++
            localIndex++
            lastIndex = beatIndex

            if (waveIndex >= samplesPerWave) waveIndex = 0
          }

          carryover = 0

          while (waveIndex < samplesPerWave) {
            let valueL = someArrayL[bufferPointer + localIndex] || 0.0
            let valueR = someArrayR[bufferPointer + localIndex] || 0.0
            let sampleL = waveFunction(gridData.tone)(waveIndex, samplesPerWave)
            let sampleR = waveFunction(gridData.tone)(waveIndex, samplesPerWave)

            sampleL = sampleL * gridData.volume * (1 - gridData.pan / 4)
            sampleR = sampleR * gridData.volume * (gridData.pan / 4)

            valueL += sampleL
            valueR += sampleR

            if (valueL > 1.0)
              valueL = 1.0
            else if (valueL < -1.0)
              valueL = -1.0

            if (valueR > 1.0)
              valueR = 1.0
            else if (valueR < -1.0)
              valueR = -1.0

            someArrayL[bufferPointer + localIndex] = valueL
            someArrayR[bufferPointer + localIndex] = valueR

            localIndex++
            waveIndex++
            carryover++
          }

          lastIndex = beatIndex
        }
      })

      bufferSizes[pIndex] = someArrayL.length

      let buffer = audioCtx.createBuffer(2, someArrayL.length, sampleRate)
      let bufferingL = buffer.getChannelData(0)
      let bufferingR = buffer.getChannelData(1)

      for (let m = 0; m < someArrayL.length; m++) {
        bufferingL[m] = someArrayL[m]
        bufferingR[m] = someArrayR[m]
      }

      phraseBuffers[pIndex] = buffer
    })
  })

  return {
    phraseBuffers: phraseBuffers,
    bufferSizes: bufferSizes
  }
}

const generateSequence = (phraseData, bufferData) => {
  let offset = 0
  let beatsPerMeasure = 4
  let bufferingL
  let bufferingR

  let timeStops = []
  let millisPer16ths = []
  let totalMillis = 0

  let len = phraseData.sequence.reduce((acc, seqNo) => acc = acc + bufferData.bufferSizes[seqNo - 1], 0)
  let buffer = audioCtx.createBuffer(2, len, sampleRate)

  bufferingL = buffer.getChannelData(0)
  bufferingR = buffer.getChannelData(1)

  phraseData.sequence.forEach((seqNo, index) => {
    let pIndex = seqNo - 1
    let phrase = phraseData.phrases[pIndex]
    let pbpm = phrase.bpm
    let beatsPerSecond = pbpm / 60.0
    let secondsPerBeat = 1.0 / beatsPerSecond
    let seconds = secondsPerBeat * beatsPerMeasure
    let millis = Math.round(seconds * 1000)
    let interval = Math.round(millis / 16)

    let bufferSize = bufferData.bufferSizes[pIndex]
    let phraseBuffer = bufferData.phraseBuffers[pIndex]
    let phraseBufferingL = phraseBuffer.getChannelData(0)
    let phraseBufferingR = phraseBuffer.getChannelData(1)

    totalMillis += millis
    timeStops[index] = totalMillis
    millisPer16ths[index] = interval

    for (let i = 0; i < phraseBufferingL.length; i++) {
      bufferingL[offset + i] = phraseBufferingL[i]
      bufferingR[offset + i] = phraseBufferingR[i]
    }

    offset += bufferSize
  })

  return { buffer, totalMillis, timeStops, millisPer16ths, sequence: phraseData.sequence }
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

const togglePlay = (id) => {
  let hint = document.querySelector(`#playHint${id}`)

  if (!bufferSource) {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      unmute(audioCtx)
    }

    bufferSource = audioCtx.createBufferSource()
  }

  if (loaded === null || loaded === undefined || loadedId === null || loadedId === undefined || id !== loadedId) {
    // { buffer, totalMillis, timeStops, millisPer16ths, sequence: phraseData.sequence }
    loaded = generateSound(reps[id])
    loadedId = id
  }

  if (nowPlaying === null) {
    hint.innerText = 'tap to stop'
    nowPlaying = id
    timerId = setInterval(highlightColumn, 20)
    timerStart = Date.now()
    play()
  } else if (nowPlaying === id) {
    afterStop = () => {
      nowPlaying = null
      hint.innerText = 'tap to play'
    }

    stop()
  } else {
    afterStop = () => {
      let oldHint = document.querySelector(`#playHint${nowPlaying}`)
      oldHint.innerText = 'tap to play'
      hint.innerText = 'tap to stop'
      nowPlaying = id
      timerId = setInterval(highlightColumn, 50)
      timerStart = Date.now()
      play()
    }

    stop()
  }
}

const play = () => {
  bufferSource = audioCtx.createBufferSource()
  bufferSource.connect(audioCtx.destination)
  bufferSource.buffer = loaded.buffer
  bufferSource.onended = () => {
    finishTimer()

    if (afterStop) {
      afterStop()
      afterStop = null
    } else {
      let hint = document.querySelector(`#playHint${nowPlaying}`)
      hint.innerText = 'tap to play'
      nowPlaying = null
    }
  }
  bufferSource.start()
}

const stop = () => {
  try {
    bufferSource.stop()
  } catch (e) {}
}

let timerId
let timerStart
let lastPlayheadPhrase
let lastPlayheadIndex
let sequenceIndex
let phraseIndex
let lastSequenceIndex

const gatherColumns = (data, id) => {
  let cols = []

  for (let i = 0; i < data.phrases.length; i++) {
    cols[i] = []

    for (let j = 0; j < 16; j++) {
      cols[i][j] = []
    }
  }

  for (let i = 0; i < data.phrases.length; i++) {
    for (let j = 0; j < data.phrases[i].grids.length; j++) {
      const grid = document.querySelector(`#grid${id}-${i}-${j}`)
      const elems = grid.querySelectorAll(':scope .d .b')

      forEach(elems, (m, elem) => {
        cols[i][m % 16].push(elem)
      })
    }
  }

  return cols
}

const highlightColumn = () => {
  const elapsedTime = Date.now() - timerStart
  const millis = elapsedTime % loaded.totalMillis

  sequenceIndex = loaded.timeStops.findIndex(n => millis < n)
  phraseIndex = loaded.sequence[sequenceIndex] - 1

  const index = Math.floor((millis - (loaded.timeStops[sequenceIndex - 1] || 0)) / loaded.millisPer16ths[sequenceIndex]) % 16

  if (lastPlayheadIndex !== index || lastPlayheadPhrase !== phraseIndex) {
    if (lastPlayheadIndex !== null && lastPlayheadIndex !== undefined) {
      columns[nowPlaying][lastPlayheadPhrase][lastPlayheadIndex].forEach(td => {
        td.classList.remove("gray")
      })
    }

    columns[nowPlaying][phraseIndex][index].forEach(td => {
      td.classList.add("gray")
    })


    lastPlayheadPhrase = phraseIndex
    lastPlayheadIndex = index
    lastSequenceIndex = sequenceIndex
  }
}

const finishTimer = () => {
  clearInterval(timerId)

  timerId = null
  timerStart = null

  forEach(document.querySelectorAll('.b'), (i, td) => td.classList.remove('gray'))

  lastPlayheadPhrase = null
  lastPlayheadIndex = null
  lastSequenceIndex = null
}
