const Sound = {
  toneConstant: 1.059463,
  sampleRate: 22050,
  noteFrequencies: {
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
}

let drum = new Drums()

function WaveSample(tone, samplesPerWave, multiplier = null) {
  this.tone = tone
  this.samplesPerWave = samplesPerWave
  this.multiplier = multiplier

  this.sample = (index) => {
    switch(this.tone) {
      case 0:
        return this.square(index)
      case 1:
        return this.sine(index)
      case 2:
        return this.triangle(index)
      case 3:
        return this.noise(index)
      case 4:
        return this.saw(index)
      default:
        return this.sine(index)
    }
  }

  this.sine = (index) => {
    return Math.sin(index / (this.samplesPerWave / (Math.PI * 2))) * (this.multiplier || 0.8)
  }

  this.saw = (index) => {
    let interval = Math.round(this.samplesPerWave / 2)
    let halfInterval = Math.round(interval / 2)
    let percent = ((index + halfInterval) % interval) / interval
    return ((0.6 * percent) - 0.3) * (this.multiplier || 1.0)
  }

  this.square = (index) => {
    return (index <= this.samplesPerWave / 2 ? 1.0 : -1.0) * (this.multiplier || 0.3)
  }

  this.noise = (index) => {
    let value = this.sine(index)
    let rand = Math.random() - 0.5
    return value * rand * (this.multiplier || 1.0)
  }

  this.triangle = (index) => {
    let half = Math.round(this.samplesPerWave / 2)
    let quarter = Math.round(this.samplesPerWave / 4)
    let ramp = 1.0 / quarter
    let mult = this.multiplier || 1.0

    if (index <= half) {
      if (index <= quarter) {
        return index * ramp * mult
      } else {
        return (half - index) * ramp * mult
      }
    } else {
      if (index <= half + quarter) {
        return -((index - half) * ramp) * mult
      } else {
        return -((this.samplesPerWave - index) * ramp) * mult
      }
    }
  }
}

function Drums() {
  this.kickSample = (note, index) => {
    return this.drums[note][index]
  }

  this.kickLength = (note) => {
    return this.drums[note].length
  }

  this.generate = () => {
    let base = 100

    this.drums = [...Array(16).keys()].map((i) => {
      return this.sineDrum(base * (1 + (i * 0.25)))
    }).reverse()
  }

  this.sineDrum = (baseFrequency) => {
    let changes = 10
    let a = []

    for (let i = 0; i < changes; i++) {
      let calc = 1 - (i / changes)
      let freq = baseFrequency * calc
      let samplesPerWave = Math.round(Sound.sampleRate / freq)

      for (let j = 0; j < 5; j++) {
        let b = []

        for(let k = 0; k < samplesPerWave; k++) {
          b[k] = new WaveSample(1, samplesPerWave, calc).sample(k)
        }

        a = a.concat(b)
      }
    }

    return a
  }

  this.generate()
}

function Phrase() {
  this.grids = []
  this.beatsPerMeasure = 4
  this.beatsPerSecond = () => this.bpm / 60.0
  this.secondsPerBeat = () => 1.0 / this.beatsPerSecond()
  this.seconds = () => this.secondsPerBeat() * this.beatsPerMeasure
  this.millis = () => Math.round(this.seconds() * 1000)
  this.millisPer16ths = () => Math.round(this.millis() / 16)
  this.bufferSize = () => Math.round(this.seconds() * Sound.sampleRate)
  this.subBufferSize = () => Math.round(this.bufferSize() / 16)

  this.deleteGrid = (gridIndex) => {
    this.grids.splice(gridIndex, 1)
    this.buffer(true)
  }

  this.createGrid = () => {
    let g = new Grid()
    g.phrase = this
    g.root = this.root
    g.tone = 1
    g.octave = 3
    g.length = 1.0
    g.volume = 1.0
    g.pan = 2
    g.reverb = 0
    g.steps = Array(16).fill(null)

    this.grids.push(g)

    return this.grids.length - 1
  }

  this.setRoot = (newRoot) => {
    this.root = newRoot
    this.grids.forEach((g) => g.setRoot(newRoot))
    this.buffer(true)
  }

  this.setBpm = (newBpm) => {
    this.bpm = newBpm
    this.buffer(true)
  }

  this.encode = () => {
    let beatString = ''

    beatString = beatString.concat(this.bpm.toString(16).toUpperCase().padStart(2, '0'))
    beatString = beatString.concat(Object.keys(Sound.noteFrequencies).indexOf(this.root).toString(16))
    beatString = beatString.concat(this.id.toString(16).toUpperCase().padStart(2, '0'))
    beatString = beatString.concat(';')

    this.grids.forEach((grid) => {
      beatString = beatString.concat(grid.tone)
      beatString = beatString.concat(grid.octave)
      beatString = beatString.concat([0.25, 0.5, 0.75, 1.0].indexOf(grid.length))
      beatString = beatString.concat([0.25, 0.5, 0.75, 1.0].indexOf(grid.volume))
      beatString = beatString.concat(grid.pan)
      beatString = beatString.concat(grid.reverb)

      grid.steps.forEach((step, index) => {
        if (step !== null && step !== undefined) {
          beatString = beatString.concat(index.toString(16).toUpperCase(), step.toString(16).toUpperCase())
        }
      })

      beatString = beatString.concat(';')
    })

    return beatString.slice(0, -1)
  }

  this.wave = (tone, waveIndex, samplesPerWave) => {
    return new WaveSample(tone, samplesPerWave).sample(waveIndex)
  }

  this.buffer = (regen = false) => {
    if (!this._buffer || regen) {
      this._buffer = this.generateBuffer()
      this.realBufferSize = this._buffer.length
    }

    return this._buffer
  }

  this.generateBuffer = () => {
    let main = Array(this.bufferSize())
    let lastStep = -1
    let carryOver = 0

    this.grids.forEach((grid) => {
      grid.steps.forEach((note, step) => {
        let temp

        if (grid.hasReverb()) {
          temp = Array(this.bufferSize())
        }

        if (note !== null && note !== undefined) {
          let bufferPointer = step * this.subBufferSize()
          let localIndex = 0
          let waveIndex = 0
          let lengthOffset = (1 - grid.length) * this.subBufferSize()
          let frequency = grid.notes()[note]
          let samplesPerWave = Math.round(Sound.sampleRate / frequency)

          if (step === lastStep + 1 && !grid.isDrum()) localIndex = carryOver

          carryOver = 0

          while (localIndex + lengthOffset < this.subBufferSize() ||
                (grid.isDrum() && localIndex < drum.kickLength(note)) ||
                waveIndex !== 0) {
            let value = (temp ? temp : main)[bufferPointer + localIndex] || new Sample()

            let s = grid.isDrum() ?
                    (drum.kickSample(note, localIndex) || 0.0) :
                    this.wave(grid.tone, waveIndex, samplesPerWave)

            value.addLeft(s * grid.volume * (1 - grid.pan / 4.0))
            value.addRight(s * grid.volume * (grid.pan / 4.0))

            if (temp) {
              temp[bufferPointer + localIndex] = value
            } else {
              main[bufferPointer + localIndex] = value
            }

            waveIndex += 1
            localIndex += 1

            if (waveIndex >= samplesPerWave) waveIndex = 0
            if (localIndex + lengthOffset >= this.subBufferSize()) carryOver += 1
          }

          if (grid.hasReverb()) {
            let offset = grid.reverbOffset()
            let decay = grid.decay()

            for (let i = 0; i < temp.length; i++) {
              if (i + offset < temp.length) {
                let verb = temp[i + offset] || new Sample()

                verb.addLeft((temp[i] || new Sample()).left * decay)
                verb.addRight((temp[i] || new Sample()).right * decay)

                temp[i + offset] = verb
              }

              let value = main[i] || new Sample()

              value.addLeft((temp[i] || new Sample()).left)
              value.addRight((temp[i] || new Sample()).right)

              main[i] = value
            }
          }
        }

        lastStep = step
      })
    })
      
    return main
  }

  this.noteNames = () => {
    const noteNames = Object.keys(Sound.noteFrequencies)
    let index = noteNames.indexOf(this.root)

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
}

function Grid() {
  this.steps = Array(16).fill(null)

  this.setTone = (newTone) => {
    this.tone = newTone
    this.tones(true)
    this.phrase.buffer(true)
  }

  this.setOctave = (newOctave) => {
    this.octave = newOctave
    this.notes(true)
    this.tones(true)
    this.phrase.buffer(true)
  }

  this.setLength = (newLength) => {
    this.length = newLength
    this.tones(true)
    this.phrase.buffer(true)
  }

  this.setVolume = (newVolume) => {
    this.volume = newVolume
    this.tones(true)
    this.phrase.buffer(true)
  }

  this.setPan = (newPan) => {
    this.pan = newPan
    this.tones(true)
    this.phrase.buffer(true)
  }

  this.setReverb = (newReverb) => {
    this.reverb = newReverb
    this.tones(true)
    this.phrase.buffer(true)
  }

  this.setRoot = (newRoot) => {
    this.root = newRoot
    this.notes(true)
    this.tones(true)
    this.phrase.buffer(true)
  }

  this.setStep = (stepIndex, noteIndex) => {
    this.steps[stepIndex] = noteIndex
    this.phrase.buffer(true)
  }

  this.tones = (regen = false) => {
    if (!this._tones || regen) {
      this._tones = this.generateTones()
    }

    return this._tones
  }

  this.generateTones = () => {
    let tones = []

    for (let k = 0; k < this.notes().length; k++) {
      let temp
      let main = []
      let bufferPointer = 0
      let localIndex = 0
      let waveIndex = 0
      let lengthOffset = (1 - this.length) * this.phrase.subBufferSize()
      let frequency = this.notes()[k]
      let samplesPerWave = Math.round(Sound.sampleRate / frequency)

      if (this.hasReverb()) temp = []

      while (localIndex + lengthOffset < this.phrase.subBufferSize() ||
            (this.isDrum() && localIndex < drum.kickLength(k)) ||
            waveIndex !== 0) {
        let value = (temp ? temp : main)[bufferPointer + localIndex] || new Sample()

        let s = this.isDrum() ?
                (drum.kickSample(k, localIndex) || 0.0) :
                this.phrase.wave(this.tone, waveIndex, samplesPerWave)

        value.addLeft(s * this.volume * (1 - this.pan / 4.0))
        value.addRight(s * this.volume * (this.pan / 4.0))

        if (temp) {
          temp[bufferPointer + localIndex] = value
        } else {
          main[bufferPointer + localIndex] = value
        }

        waveIndex += 1
        localIndex += 1

        if (waveIndex >= samplesPerWave) waveIndex = 0
      }

      if (this.hasReverb()) {
        let offset = this.reverbOffset()
        let decay = this.decay()

        for (let i = 0; i < temp.length; i++) {
          if (i + offset < temp.length) {
            let verb = temp[i + offset]

            verb.addLeft(temp[i].left * decay)
            verb.addRight(temp[i].right * decay)

            temp[i + offset] = verb
          }

          let value = main[i] || new Sample()

          value.addLeft((temp[i] || new Sample()).left)
          value.addRight((temp[i] || new Sample()).right)

          main[i] = value
        }
      }

      let realBufferSize = main.length
      let pBuffer = audioCtx().createBuffer(2, realBufferSize, Sound.sampleRate)
      let bufferingL = pBuffer.getChannelData(0)
      let bufferingR = pBuffer.getChannelData(1)

      for (let m = 0; m < realBufferSize; m++) {
        bufferingL[m] = (main[m] || new Sample()).left
        bufferingR[m] = (main[m] || new Sample()).right
      }

      tones[k] = pBuffer
    }

    return tones
  }

  this.hasReverb = () => {
    return this.reverb > 0
  }

  this.isDrum = () => {
    return this.tone === 5
  }

  this.notes = (regen = false) => {
    if (!this._notes || regen) {
      this._notes = this.generateNotes()
    }

    return this._notes
  }

  this.toneClass = () => {
    switch (this.tone) {
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
      case 5:
        return 'gold'
    }
  }

  this.generateNotes = () => {
    let n = Array(12).fill(null)

    let octaveShift = Math.pow(Sound.toneConstant, 12)
    let shiftCount = 0

    if (this.octave < 4) {
      octaveShift = 1 / octaveShift
      shiftCount = 4 - this.octave
    } else if (this.octave > 4) {
      shiftCount = this.octave - 4
    }

    let rootFreq = Sound.noteFrequencies[this.root]

    for (let i = 0; i < shiftCount; i++) {
      rootFreq = rootFreq * octaveShift
    }

    n[12] = rootFreq

    for (let i = 12; i > 0; i--) {
      n[12 - i] = this.generateNoteFrequency(i, rootFreq)
    }

    return n
  }

  this.generateNoteFrequency = (index, root) => {
    let r = root

    for (let i = 0; i < index; i++) {
      r = r * Sound.toneConstant
    }

    return r
  }

  this.delay = () => {
    return this.reverb === 0 ? 0.0 : 0.1
  }

  this.decay = () => {
    switch(this.reverb) {
      case 0:
        return 0.0
      case 1:
        return 0.25
      case 2:
        return 0.5
      case 3:
        return 0.75
      default:
        return 0.0
    }
  }

  this.reverbOffset = () => Math.round(Sound.sampleRate * this.delay())
}

function Sample() {
  this.left = 0.0
  this.right = 0.0

  this.addLeft = (l) => {
    this.left += l

    if (this.left > 1.0) {
      this.left = 1.0
    } else if (this.left < -1.0) {
      this.left = -1.0
    }

    return this.left
  }

  this.addRight = (r) => {
    this.right += r

    if (this.right > 1.0) {
      this.right = 1.0
    } else if (this.right < -1.0) {
      this.right = -1.0
    }

    return this.right
  }
}

function PTune (id = null, rep = null) {
  this.id = id
  this.rep = rep

  this.deletePhraseById = (phraseId) => {
    const phraseCount = this.phrases().length
    this._phrases = this.phrases().filter(p => p.id !== phraseId)
    this._sequence = this.sequence().filter(s => s !== phraseId)
    return this.phrases().length === phraseCount - 1
  }

  this.copyGridToPhraseByIds = (fromPhraseId, gridIndex, toPhraseId) => {
    let fromPhrase = this.phraseById(fromPhraseId)
    let toPhrase = this.phraseById(toPhraseId)
    let g = fromPhrase.grids[gridIndex]
    let ng = new Grid()

    ng.root = g.root
    ng.tone = g.tone
    ng.octave = g.octave
    ng.length = g.length
    ng.volume = g.volume
    ng.pan = g.pan
    ng.reverb = g.reverb
    ng.steps = Array(16).fill(null)

    g.steps.forEach((s, i) => ng.steps[i] = s)

    toPhrase.grids.push(ng)

    return toPhrase.grids.length - 1
  }

  this.setSequence = (newSequence) => {
    this._sequence = newSequence
  }

  this.assignSequence = (index, phraseId) => {
    this._sequence[index] = phraseId
  }

  this.encode = () => {
    let beatString = encodeURIComponent(this.name).concat('|')

    beatString = beatString.concat(
      this.sequence().map(s => s.toString(16).toUpperCase().padStart(2, '0')).join('').concat('|')
    )

    beatString = beatString.concat(this.phrases().map((p) => p.encode()).join('|'))

    return beatString
  }

  this.duplicatePhrase = (phraseId) => {
    let phrase = this.phraseById(phraseId)
    let newPhrase = new Phrase()
    newPhrase.bpm = phrase.bpm
    newPhrase.root = phrase.root
    newPhrase.id = this.nextPhraseId()
    newPhrase.grids = []

    phrase.grids.forEach((g) => {
      let ng = new Grid()

      ng.root = g.root
      ng.tone = g.tone
      ng.octave = g.octave
      ng.length = g.length
      ng.volume = g.volume
      ng.pan = g.pan
      ng.reverb = g.reverb
      ng.steps = Array(16).fill(null)

      g.steps.forEach((s, i) => ng.steps[i] = s)

      newPhrase.grids.push(ng)
    })

    return this.phrases().push(newPhrase)
  }

  this.createPhrase = (bpm = null, root = null) => {
    if (this.nextPhraseId() === 256) return null

    let p = new Phrase()
    p.bpm = bpm || 110
    p.root = root || 'C'
    p.id = this.nextPhraseId()
    p.grids = []

    this.phrases().push(p)

    return p
  }

  this.nextPhraseId = () => {
    return this.phrases().reduce((max, phrase) => phrase.id > max ? phrase.id : max, -1) + 1
  }

  this.parse = () => {
    parsed = {}
    phrases = this.rep.split('|')

    this.name = decodeURIComponent(phrases.shift())
    this._sequence = phrases.shift().match(/.{1,2}/g).map(n => parseInt(n, 16))

    return phrases.map((phrase) => {
      let p = new Phrase()
      
      const patterns = phrase.split(';')
      const phraseInfo = patterns.shift()

      p.bpm = parseInt(phraseInfo.slice(0, 2), 16)
      p.root = Object.keys(Sound.noteFrequencies)[parseInt(phraseInfo[2], 16)]
      p.id = parseInt(phraseInfo.slice(3, 5), 16)

      p.grids = patterns.map((pattern, index) => {
        if (!!pattern) {
          let g = new Grid()
          
          g.phrase = p
          g.root = p.root
          g.tone = parseInt(pattern[0])
          g.octave = parseInt(pattern[1])
          g.length = parseFloat([0.25, 0.5, 0.75, 1.0][parseInt(pattern[2])])
          g.volume = parseFloat([0.25, 0.5, 0.75, 1.0][parseInt(pattern[3])])
          g.pan = parseInt(pattern[4])
          g.reverb = parseInt(pattern[5])

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
              g.steps[columnIndex] = noteIndex
            })
          }
          
          return g
        }
      })
    
      return p
    })
  }

  this.idealSquare = () => {
    let total = this.phrases().reduce((acc, curr) => {
      return acc + curr.grids.length
    }, 0)

    let ideal = 1

    while (ideal ** 2 < total) {
      ideal += 1
    }

    return ideal
  }

  this.idealGridWidth = () => {
    return `${1.0 / this.ideal_square() * 100}%`
  }

  this.timeStops = () => {
    if (!this._timeStops) {
      this.generateSequence()
    }

    return this._timeStops
  }

  this.phraseById = (id) => {
    return this.phrases().find((p) => p.id === id)
  }

  this.phrases = () => {
    if (!this._phrases) {
      this._phrases = this.parse()
    }

    return this._phrases
  }

  this.sequence = () => {
    if (!this._sequence) {
      this.parse()
    }

    return this._sequence
  }

  this.sound = (regen = false) => {
    if (!this._sound || regen) {
      this._sound = this.generateSequence()
    }

    return this._sound
  }

  this.buffer = (regen = false) => {
    if (!this._buffer || regen) {
      this._buffer = audioCtx().createBuffer(2, this.sound(regen).length, Sound.sampleRate)

      let bufferingL = this._buffer.getChannelData(0)
      let bufferingR = this._buffer.getChannelData(1)

      for (let i = 0; i < bufferingL.length; i++) {
        bufferingL[i] = (this.sound()[i] || new Sample()).left
        bufferingR[i] = (this.sound()[i] || new Sample()).right
      }
    }

    return this._buffer
  }

  this.generateSequence = () => {
    this._timeStops = []
    this.totalMillis = 0
    this.millisPer16ths = []

    let offset = 0

    let tuneBufferLength = this.sequence().reduce((acc, seqNum) => {
      return acc + this.phraseById(seqNum).bufferSize()
    }, 0)

    let main = Array(tuneBufferLength)

    this.sequence().forEach((seqNum, seqIndex) => {
      phrase = this.phrases().find((p) => p.id === seqNum)

      phrase.buffer().forEach((sample, index) => {
        if (offset + index < tuneBufferLength) {
          let value = main[offset + index] || new Sample()

          value.addLeft(sample.left)
          value.addRight(sample.right)

          main[offset + index] = value
        }
      })

      this.totalMillis += phrase.millis()
      this._timeStops[seqIndex] = this.totalMillis
      this.millisPer16ths[seqIndex] = phrase.millisPer16ths()

      offset += phrase.bufferSize()
    })

    return main
  }

  this.columns = () => {
    if (!this._columns) {
      this._columns = new Columns(this)
    }

    return this._columns.get()
  }
}

function Columns (ptune) {
  this.columns = []

  for (let i = 0; i < ptune.phrases().length; i++) {
    this.columns[i] = []

    for (let j = 0; j < 16; j++) {
      this.columns[i][j] = []
    }
  }
  
  for (let i = 0; i < ptune.phrases().length; i++) {
    for (let j = 0; j < ptune.phrases()[i].grids.length; j++) {
      let grid = document.querySelector(`#grid${ptune.id}-${ptune.phrases()[i].id}-${j}`) ||
        document.querySelector(`#grid${ptune.phrases()[i].id}-${j}`)

      if (!grid) break

      const elems = [...grid.querySelectorAll(':scope .d .b')]

      elems.forEach((elem, index) => {
        this.columns[i][index % 16].push(elem)
      })
    }
  }

  this.get = () => {
    return this.columns
  }
}
