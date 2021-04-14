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

const sawSample = (index, samplesPerWave, multiplier = 1.0) => {
  let interval = parseInt(samplesPerWave / 2)
  let hInterval = parseInt(interval / 2)
  let per = ((index + hInterval) % interval) / interval
  return ((0.6 * per) - 0.3) * multiplier
}

const squareSample = (index, samplesPerWave, multiplier = 1.0) => {
  return (index <= parseInt(samplesPerWave / 2) ? 0.3 : -0.3) * multiplier
}

const fuzzSample = (index, samplesPerWave, multiplier = 1.0) => {
  let value = sineSample(index, samplesPerWave, 1.0)
  let rand = Math.random() - 0.5 
  return (value + rand) * multiplier
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

const drumSampleCounts = {
  kick: 22050 * 0.1
}

const drumSample = (index, samplesPerWave, multiplier = 1.0) => {
}

const kicks = () => {
  let base = 100
  let a = []

  for (let i = 0; i < 16; i++) {
    a[15 - i] = gsd2(base * (1 + (i * 0.25)))
  }

  return a
}

const gsd2 = (baseFreq) => {
  let changes = 10
  let numSamples = drumSampleCounts.kick
  let quarterSamples = parseInt(numSamples / changes)
  let a = []
  let j = 0

  for (let i = 0; i < changes; i++) {
    let calc = 1 - (i / changes)
    let freq = Math.round(baseFreq * calc)
    let samplesPerWave = parseInt(sampleRate / freq)
    let wavesThatWillFit = parseInt(quarterSamples / samplesPerWave)

    for (let w = 0; w < wavesThatWillFit; w++) {
      let b = []

      for (let r = 0; r < samplesPerWave; r++) {
        b[r] = sineSample(r, samplesPerWave, calc)
        j++
      }

      a = a.concat(b)
    }
  }

  return a
}

const generateSineDrum = (baseFreq) => {
  let freqChanges = 5
  let numSamples = drumSampleCounts.kick
  let samplesPerFreqChange = numSamples / freqChanges
  let i = 0
  let a = []

  while (i < numSamples) {
    let someCalculation = 1 - (Math.round(i / samplesPerFreqChange) / freqChanges)
    let freq = Math.round(baseFreq * someCalculation)
    let samplesPerWave = parseInt(sampleRate / freq)

    a[i] = sineSample(i, samplesPerWave, someCalculation) * 0.5

    i++
  }

  return a
}

const sineSample = (index, samplesPerWave, multiplier = 1.0) => {
  return Math.sin(index / (samplesPerWave / (Math.PI * 2))) * multiplier
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
    case 4:
      return sawSample
    case 5:
      return drumSample
    default:
      return squareSample
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
    case 5:
      return 'gold'
  }
}

const forEach = (array, callback, scope) => {
  for (let i = 0; i < array.length; i++) {
    callback.call(scope, i, array[i])
  }
}

const insertAfter = (newNode, existingNode) => {
  existingNode.parentNode.insertBefore(newNode, existingNode.nextSibling)
}

const generateNoteFrequency = (multiplier, root) => {
  let val = root

  for (let i = 0; i < multiplier; i++) {
    val = val * toneConstant
  }

  return parseInt(val)
}
