let audioCtx
let bufferSource
let nowPlaying = null // id of the tune that is currently playing
let afterStop = null // callback to do work after bufferSource "onended" callback triggers
let drums = {
  kick: kicks()
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
    phrase.id = parseInt(pattern.slice(3, 5), 16)

    patterns.forEach((pattern, index) => {
      let grid = {}

      if (!!pattern) {
        grid.tone = parseInt(pattern[0])
        grid.octave = parseInt(pattern[1])
        grid.noteLength = parseFloat([0.25, 0.5, 0.75, 1.0][parseInt(pattern[2])])
        grid.volume     = parseFloat([0.25, 0.5, 0.75, 1.0][parseInt(pattern[3])])
        grid.pan = parseInt(pattern[4])
        grid.reverb = parseInt(pattern[5])
        grid.notes = generateNotes(grid.octave, phrase.rootNote)
        grid.pattern = []

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
  let phraseBuffers = {}
  let bufferSizes = {}
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
      let tempL, tempR, reverbOffset, delay, decay

      if (gridData.reverb > 0) {
        tempL = Array(bufferSize).fill(0.0)
        tempR = Array(bufferSize).fill(0.0)
        
        switch (gridData.reverb) {
          case 1:
            delay = 0.1
            decay = 0.25
            break;
          case 2:
            delay = 0.1
            decay = 0.5
            break;
          case 3:
            delay = 0.1
            decay = 0.75
            break;
          default:
            delay = 0.1
            decay = 0.25
        }

        reverbOffset = Math.floor(sampleRate * delay)
      }

      gridData.pattern.forEach((noteIndex, beatIndex) => {
        if (noteIndex !== null && noteIndex !== undefined) {
          let bufferPointer = beatIndex * subBufferSize // start of the "16th" subsection
          let localIndex = 0
          let rampIn = true
          let rampOut = true
          let waveIndex = 0
          let lengthOffset = (1.0 - gridData.noteLength) * subBufferSize
          let isDrum = gridData.tone === 5

          if (beatIndex === lastIndex + 1 && !isDrum) {
            localIndex = carryover
            rampIn = false
          }

          if (gridData.pattern[beatIndex + 1] !== undefined && gridData.pattern[beatIndex + 1] !== null && !isDrum) {
            rampOut = false
          }

          freq = gridData.notes[noteIndex]
          samplesPerWave = parseInt(sampleRate / freq)

          while (localIndex + lengthOffset < subBufferSize) {
            let valueL, valueR, sampleL, sampleR

            if (tempL) {
              valueL = tempL[bufferPointer + localIndex] || 0.0
              valueR = tempR[bufferPointer + localIndex] || 0.0
            } else {
              valueL = someArrayL[bufferPointer + localIndex] || 0.0
              valueR = someArrayR[bufferPointer + localIndex] || 0.0
            }

            if (isDrum) {
              let dv = drums.kick[noteIndex][localIndex]

              if (dv === null || dv === undefined) dv = 0.0

              sampleL = dv
              sampleR = dv
            } else {
              sampleL = waveFunction(gridData.tone)(waveIndex, samplesPerWave)
              sampleR = waveFunction(gridData.tone)(waveIndex, samplesPerWave)
            }

            sampleL = sampleL * gridData.volume * (1 - gridData.pan / 4)
            sampleR = sampleR * gridData.volume * (gridData.pan / 4)

            if (rampIn && localIndex < 220) {
              sampleL = sampleL * (localIndex / 220)
              sampleR = sampleR * (localIndex / 220)
            } else if (rampOut && subBufferSize - (localIndex + lengthOffset) <= 220) {
              sampleL = sampleL * ((subBufferSize - (localIndex + lengthOffset)) / 220)
              sampleR = sampleR * ((subBufferSize - (localIndex + lengthOffset)) / 220)
            }

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

            if (tempL) {
              tempL[bufferPointer + localIndex] = valueL
              tempR[bufferPointer + localIndex] = valueR
            } else {
              someArrayL[bufferPointer + localIndex] = valueL
              someArrayR[bufferPointer + localIndex] = valueR
            }

            waveIndex++
            localIndex++
            lastIndex = beatIndex

            if (waveIndex >= samplesPerWave) waveIndex = 0
          }

          carryover = 0

          if (!rampOut) {
            while (waveIndex < samplesPerWave) {
              let valueL, valueR, sampleL, sampleR

              if (tempL) {
                valueL = tempL[bufferPointer + localIndex] || 0.0
                valueR = tempR[bufferPointer + localIndex] || 0.0
              } else {
                valueL = someArrayL[bufferPointer + localIndex] || 0.0
                valueR = someArrayR[bufferPointer + localIndex] || 0.0
              }

              if (isDrum) {
                let dv = drums.kick[noteIndex][localIndex]

                if (dv === null || dv === undefined) dv = 0.0

                sampleL = dv
                sampleR = dv
              } else {
                sampleL = waveFunction(gridData.tone)(waveIndex, samplesPerWave)
                sampleR = waveFunction(gridData.tone)(waveIndex, samplesPerWave)
              }

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

              if (tempL) {
                tempL[bufferPointer + localIndex] = valueL
                tempR[bufferPointer + localIndex] = valueR
              } else {
                someArrayL[bufferPointer + localIndex] = valueL
                someArrayR[bufferPointer + localIndex] = valueR
              }

              localIndex++
              waveIndex++
              carryover++
            }
          }

          lastIndex = beatIndex
        }
      })

      if (tempL) {
        for (let n = 0; n < tempL.length; n++) {
          if (n + reverbOffset < tempL.length) {
            let vL = tempL[n + reverbOffset]
            let vR = tempR[n + reverbOffset]

            vL += (tempL[n] * decay)
            vR += (tempR[n] * decay)

            if (vL > 1.0) {
              vL = 1.0
            } else if (vL < -1.0) {
              vL = -1.0
            }

            if (vR > 1.0) {
              vR = 1.0
            } else if (vR < -1.0) {
              vR = -1.0
            }

            tempL[n + reverbOffset] = vL
            tempR[n + reverbOffset] = vR
          }
          
          let vL = someArrayL[n]
          let vR = someArrayR[n]

          vL += tempL[n]
          vR += tempR[n]

          if (vL > 1.0) {
            vL = 1.0
          } else if (vL < -1.0) {
            vL = -1.0
          }

          if (vR > 1.0) {
            vR = 1.0
          } else if (vR < -1.0) {
            vR = -1.0
          }

          someArrayL[n] = vL
          someArrayR[n] = vR
        }
      }

      bufferSizes[phrase.id] = someArrayL.length

      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        unmute(audioCtx)
      }

      let buffer = audioCtx.createBuffer(2, someArrayL.length, sampleRate)
      let bufferingL = buffer.getChannelData(0)
      let bufferingR = buffer.getChannelData(1)

      for (let m = 0; m < someArrayL.length; m++) {
        bufferingL[m] = someArrayL[m]
        bufferingR[m] = someArrayR[m]
      }

      phraseBuffers[phrase.id] = buffer
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

  let len = phraseData.sequence.reduce((acc, seqNo) => acc = acc + bufferData.bufferSizes[seqNo], 0)

  let buffer = audioCtx.createBuffer(2, len, sampleRate)

  bufferingL = buffer.getChannelData(0)
  bufferingR = buffer.getChannelData(1)

  phraseData.sequence.forEach((seqNo, index) => {
    let pIndex = phraseData.phrases.findIndex((p) => p.id === seqNo)
    let phrase = phraseData.phrases[pIndex]
    let pbpm = phrase.bpm
    let beatsPerSecond = pbpm / 60.0
    let secondsPerBeat = 1.0 / beatsPerSecond
    let seconds = secondsPerBeat * beatsPerMeasure
    let millis = Math.round(seconds * 1000)
    let interval = Math.round(millis / 16)

    let bufferSize = bufferData.bufferSizes[phrase.id]
    let phraseBuffer = bufferData.phraseBuffers[phrase.id]
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

  return { buffer, totalMillis, timeStops, millisPer16ths, sequence: phraseData.sequence, phrases: phraseData.phrases }
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
      timerId = setInterval(highlightColumn, 20)
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
  let sequenceId = loaded.sequence[sequenceIndex]
  phraseIndex = loaded.phrases.findIndex((p) => p.id === sequenceId )

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

