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

let startup = true
let name = ""
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
let audioCtxRef
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
let sampleTones

const audioCtx = () => {
  if (audioCtxRef) {
    return audioCtxRef
  } else {
    audioCtxRef = new (window.AudioContext || window.webkitAudioContext)()
    unmute(audioCtxRef)
    return audioCtxRef
  }
}

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

const insertAfter = (newNode, existingNode) => {
  existingNode.parentNode.insertBefore(newNode, existingNode.nextSibling)
}

const forEach = (array, callback, scope) => {
  for (let i = 0; i < array.length; i++) {
    callback.call(scope, i, array[i])
  }
}

const paintAll = () => {
  pData.forEach((phrase, pIndex) => {
    phrase.forEach((grid, index) => {
      const elem = document.querySelector(`#grid${pIndex}-${index}`)
      const cells = elem.querySelectorAll(':scope .d')

      forEach(cells, (i, cell) => {
        let b = cell.firstElementChild

        b.classList.remove("red", "green", "blue", "orange", "purple")

        if (pData[pIndex][index][i % 16] === Math.floor(i / 16)) {
          b.classList.add(toneClass(tones[pIndex][index] || 0))
        }
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

  setEncodes()
}

const changeTone = (e) => {
  const indexStr = e.target.id.slice(4)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const pIndex = indicies[0]
  const index = indicies[1]

  tones[pIndex][index] = parseInt(e.target.value)

  paintAll()
  generateSound(pIndex)
  generateSampleTones()
  setEncodes()
}

const changeOctave = (e) => {
  const indexStr = e.target.id.slice(6)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const pIndex = indicies[0]
  const index = indicies[1]

  octaves[pIndex][index] = parseInt(e.target.value)

  generateNotes(pIndex, index)
  paintAll()
  generateSound(pIndex)
  generateSampleTones()
  setEncodes()
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
  setEncodes()
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
  setEncodes()
}

const changeNoteLength = (e) => {
  const indexStr = e.target.id.slice(10)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const pIndex = indicies[0]
  const index = indicies[1]

  noteLengths[pIndex][index] = parseFloat(e.target.value)

  generateNotes(pIndex, index)
  paintAll()
  generateSound(pIndex)
  generateSampleTones()
  setEncodes()
}

const changeRoot = (e) => {
  const note = e.target.value
  const pIndex = parseInt(e.target.id.slice(3))

  setNoteText(pIndex, note)

  rootNotes[pIndex] = note

  for (let i = 0; i < pData[pIndex].length; i++) {
    generateNotes(pIndex, i)
  }

  paintAll()
  generateSound(pIndex)
  generateSampleTones()
  setEncodes()
}

const setNoteText = (pIndex, note) => {
  const newNotes = generateNoteNames(note)

  const phrase = document.querySelector(`#phrase${pIndex}`)
  const grids = phrase.querySelectorAll('div.t')

  forEach(grids, (gridIndex, grid) => {
    const cells = grid.querySelectorAll('div.d')

    forEach(cells, (cellIndex, cell) => {
      if (cellIndex % 16 === 0) {
        let rowIndex = Math.floor(cellIndex / 16)

        if (rowIndex < newNotes.length) {
          cell.firstChild.firstChild.innerText = newNotes[rowIndex]
        } else {
          cell.firstChild.firstChild.innerText = newNotes[0]
        }
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

const deleteGrid = (e) => {
  e.preventDefault()

  const indexStr = e.target.id.slice(6)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const pIndex = indicies[0]
  let index = indicies[1]

  if (pData[pIndex].length <= 1) {
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

  if (sampleTones) sampleTones[pIndex].splice(index, 1)

  while (index < pData[pIndex].length) {
    let cont = document.querySelector(`#container${pIndex}-${index + 1}`)
    let tab = cont.querySelector(`#grid${pIndex}-${index + 1}`)
    let del = cont.querySelector('a.delete')
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
  gatherColumns2()
  setEncodes()
}

const createPhrase = () => {
  const phrases = document.querySelector('.phrases')
  const proto = document.querySelector("div.proto")
  const pIndex = pData.length

  let phraseContainer = document.createElement('div')
  phraseContainer.className = 'phrase'
  phraseContainer.id = `phrase${pIndex}`

  let phraseNo = document.createElement('div')
  phraseNo.innerText = pIndex + 1
  phraseNo.style.display = 'inline-block'
  phraseNo.style.marginBottom = '0.5em'

  let bpmContainer = document.createElement('div')

  bpmContainer.className = 'bpmAndSuch'

  let bpmLabel = document.createElement('label')
  bpmLabel.for = `bpm${pIndex}`
  bpmLabel.innerText = 'bpm'
  bpmLabel.className = 'bpmLabel'

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
  keyLabel.className = 'bpmLabel'

  let keySelect = document.createElement('select')
  keySelect.id = `key${pIndex}`
  keySelect.onchange = changeRoot

  Object.keys(noteNamesAndFreqs).forEach(name => {
    let keyOpt = document.createElement('option')
    keyOpt.text = name
    keyOpt.value = name
    keySelect.add(keyOpt)
  })

  let dupButton = document.createElement('a')
  dupButton.className = 'noStyle dupPhrase'
  dupButton.href = '#'
  dupButton.innerText = '⧉'
  dupButton.id = `dupphrase${pIndex}`
  dupButton.onclick = duplicatePhrase

  let delButton = document.createElement('a')
  delButton.href = '#'
  delButton.className = 'noStyle delPhrase'
  delButton.innerText = 'x'
  delButton.id = `delphrase${pIndex}`
  delButton.onclick = deletePhrase

  bpmContainer.appendChild(delButton)
  bpmContainer.appendChild(phraseNo)
  bpmContainer.appendChild(document.createElement('br'))
  bpmContainer.appendChild(bpmLabel)
  bpmContainer.appendChild(bpm)
  bpmContainer.appendChild(keyLabel)
  bpmContainer.appendChild(keySelect)
  bpmContainer.appendChild(dupButton)

  phraseContainer.appendChild(bpmContainer)

  let add = document.createElement('div')
  add.className = 'add'
  add.id = `add${pIndex}`
  add.onclick = createGrid
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
  createGrid({target: {id: `add${pIndex}`}})
}

const createGrid = (e) => {
  const pIndex = parseInt(e.target.id.slice(3))
  const proto = document.querySelector("div.proto")
  const phrases = document.querySelector('.phrases')
  const gridIndex = pData[pIndex].length

  let phraseContainer = document.querySelector(`#phrase${pIndex}`)
  let gridContainer = proto.cloneNode(true)
  let deleteButton = gridContainer.querySelector('a.delete')
  let lis = gridContainer.querySelector('select.tone')
  let oct = gridContainer.querySelector('select.octave')
  let ntl = gridContainer.querySelector('select.notelength')
  let add = phraseContainer.querySelector(`#add${pIndex}`)
  let vol = gridContainer.querySelector('select.volume')
  let pan = gridContainer.querySelector('select.pan')

  gridContainer.classList.remove('proto')
  gridContainer.id = `container${pIndex}-${gridIndex}`
  gridContainer.style.width = `20em`
  gridContainer.style.margin = '0 1em 0 0'

  let a = gridContainer.querySelector('.t')
  a.id = `grid${pIndex}-${gridIndex}`

  let cells = a.querySelectorAll('.d')
  forEach(cells, (i, cell) => {
    let b = cell.querySelector('.b')
    let rowNo = Math.floor(i / 16)
    let cellNo = i % 16

    if (rowNo % 2 === 0) {
      if (cellNo % 2 === 0) {
        b.classList.add('gray3')
      } else {
        b.classList.add('gray2')
      }
    } else {
      if (cellNo % 2 === 0) {
        b.classList.add('gray2')
      } else {
        b.classList.add('gray3')
      }
    }
  })

  let gridActions = gridContainer.querySelector('.gridActions')
  insertAfter(a, gridActions)

  deleteButton.id = `delete${pIndex}-${gridIndex}`
  deleteButton.onclick = deleteGrid
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
  gatherColumns2()
  setEncodes()
}

const duplicatePhrase = (e) => {
  e.preventDefault()

  let pIndex = parseInt(e.target.id.slice(9))
  let encodedPhrase = encodePhrase(pIndex)
  let current = encodeAll()

  setEncodes(current.concat('|', encodedPhrase))
  init()

  let asdf = [...document.querySelectorAll('.phrase')].pop()
  asdf.style.backgroundColor = 'rgba(0,255,0,0.1)'
  setTimeout(() => {
    asdf.style.backgroundColor = 'unset'
  }, 1000)
  asdf.scrollIntoView()
}

const setEncodes = (newEncoding) => {
  let now = newEncoding || encodeAll()
  encoded = now
  history.replaceState(null, '', `?p=${now}`)
}

const deletePhrase = (e) => {
  e.preventDefault()

  if (pData.length === 1)
    return

  let pIndex = parseInt(e.target.id.slice(9))
  let parts = encodeAll().split('|')

  parts.splice(pIndex + 2, 1) // account for "sequence" and "name" data at position 0 of url parts
  parts[1] = parts[1].replaceAll((pIndex + 1).toString(16).toUpperCase().padStart(2, '0'), '') // remove from sequence too
  parts[1] = parts[1].match(/.{1,2}/g)
                     .map(n => parseInt(n, 16))
                     .filter(n => n !== pIndex + 1)
                     .map(n => n > pIndex + 1 ? n - 1 : n)
                     .map(n => n.toString(16).toUpperCase().padStart(2, '0'))
                     .join('')
  if (!parts[1])
    parts[1] = '01'

  setEncodes(parts.join('|'))
  init()
}

const createGrids = () => {
  const proto = document.querySelector("div.proto")
  const phrases = document.querySelector('.phrases')

  while (phrases.firstChild) phrases.removeChild(phrases.lastChild)

  pData.forEach((phrase, pIndex) => {
    let phraseContainer = document.createElement('div')
    phraseContainer.className = 'phrase'
    phraseContainer.id = `phrase${pIndex}`
    phraseContainer.style.position = 'relative'

    let phraseNo = document.createElement('div')
    phraseNo.style.marginBottom = '0.5em'
    phraseNo.style.display = 'inline-block'
    phraseNo.innerText = pIndex + 1

    let bpmContainer = document.createElement('div')

    bpmContainer.className = 'bpmAndSuch'

    let bpmLabel = document.createElement('label')
    bpmLabel.for = `bpm${pIndex}`
    bpmLabel.innerText = 'bpm'
    bpmLabel.className = 'bpmLabel'

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
    keyLabel.className = 'bpmLabel'

    let keySelect = document.createElement('select')
    keySelect.id = `key${pIndex}`
    keySelect.onchange = changeRoot

    Object.keys(noteNamesAndFreqs).forEach(name => {
      let keyOpt = document.createElement('option')
      keyOpt.text = name
      keyOpt.value = name
      keySelect.add(keyOpt)
    })

    let dupButton = document.createElement('a')
    dupButton.className = 'noStyle dupPhrase'
    dupButton.href = '#'
    dupButton.innerText = '⧉'
    dupButton.id = `dupphrase${pIndex}`
    dupButton.onclick = duplicatePhrase

    let delButton = document.createElement('a')
    delButton.href = '#'
    delButton.className = 'noStyle delPhrase'
    delButton.innerText = 'x'
    delButton.id = `delphrase${pIndex}`
    delButton.onclick = deletePhrase

    bpmContainer.appendChild(delButton)
    bpmContainer.appendChild(phraseNo)
    bpmContainer.appendChild(document.createElement('br'))
    bpmContainer.appendChild(bpmLabel)
    bpmContainer.appendChild(bpm)
    bpmContainer.appendChild(keyLabel)
    bpmContainer.appendChild(keySelect)
    bpmContainer.appendChild(dupButton)

    phraseContainer.appendChild(bpmContainer)

    phrase.forEach((gridData, gridIndex) => {
      let gridContainer = proto.cloneNode(true)
      gridContainer.style.width = `20em`
      gridContainer.style.margin = '0 1em 0 0'

      let a = gridContainer.querySelector('.t')
      a.id = `grid${pIndex}-${gridIndex}`

      let cells = a.querySelectorAll('.d')
      forEach(cells, (i, cell) => {
        let b = cell.querySelector('.b')
        let rowNo = Math.floor(i / 16)
        let cellNo = i % 16

        if (rowNo % 2 === 0) {
          if (cellNo % 2 === 0) {
            b.classList.add('gray3')
          } else {
            b.classList.add('gray2')
          }
        } else {
          if (cellNo % 2 === 0) {
            b.classList.add('gray2')
          } else {
            b.classList.add('gray3')
          }
        }
      })

      let gridActions = gridContainer.querySelector('.gridActions')
      insertAfter(a, gridActions)

      let deleteButton = gridContainer.querySelector('a.delete')
      let lis = gridContainer.querySelector('select.tone')
      let oct = gridContainer.querySelector('select.octave')
      let ntl = gridContainer.querySelector('select.notelength')
      let vol = gridContainer.querySelector('select.volume')
      let pan = gridContainer.querySelector('select.pan')

      gridContainer.classList.remove('proto')
      gridContainer.id = `container${pIndex}-${gridIndex}`
      deleteButton.id = `delete${pIndex}-${gridIndex}`
      deleteButton.onclick = deleteGrid
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
    add.onclick = createGrid
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

  if (phraseBuffers.length === 0) {
    generateSound(null, true)
  } else {
    generateSequence(true)
  }

  setEncodes()
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

  if (encoded === null || encoded === undefined || encoded.length === 0) {
    const params = (new URL(document.location)).searchParams
    const phraseParam = params.get('p')

    if (phraseParam !== null && phraseParam !== undefined) {
      encoded = phraseParam
    } else {
      encoded = ""
    }
  }

  if (encoded !== null && encoded !== undefined && encoded.length > 0) {
    const phrases = encoded.split('|')

    name = decodeURIComponent(phrases.shift())

    sequence = phrases.shift().match(/.{1,2}/g).map(n => parseInt(n, 16))
    
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
    name = ""
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

  createGrids()
  assignCellClicks()
  paintAll()
  setInsts()
  setRoots()
  setOctaves()
  setVolumes()
  setPans()
  remakeSequenceSelects()
  setNoteLengths()
  generateSampleTones()
  generateSound(null, true, false)
  gatherColumns2()

  document.onkeydown = (e) => {
    if (e.keyCode === 32) {
      e.preventDefault()

      if (playing) {
        stop()
      } else {
        play()
      }
    }
  }

  playButton = document.querySelector('#play')

  let nameInput = document.querySelector('#name')
  nameInput.value = name
  nameInput.onkeydown = (e) => {
    e.stopPropagation()
  }
  nameInput.onblur = (e) => {
    name = e.target.value
    name = name.replaceAll('|', '')

    if (name.length > 0) {
      e.target.classList.remove('error')
    }

    nameInput.value = name
    setEncodes()
  }
}

const assignCellClicks = () => {
  const phrases = document.querySelectorAll('.phrase')

  forEach(phrases, (_, phrase) => {
    const pIndex = parseInt(phrase.id.slice(6))
    const grids = phrase.querySelectorAll('div.t')

    forEach(grids, (i, grid) => {
      const indexStr = grid.id.slice(5)
      const gridIndex = parseInt(indexStr.split('-')[1])
      const cells = grid.querySelectorAll(':scope div.d')

      forEach(cells, (j, cell) => {
        let rowIndex = Math.floor(j / 16)
        let dataIndex = j % 16

        cell.onclick = (e) => {
          e.preventDefault()

          if (pData[pIndex][gridIndex][dataIndex] === rowIndex) {
            pData[pIndex][gridIndex][dataIndex] = null
          } else {
            pData[pIndex][gridIndex][dataIndex] = rowIndex

            if (!sampleTones) {
              generateSound()
              generateSampleTones()
            }

            let bufferSource = audioCtx().createBufferSource()
            bufferSource.connect(audioCtx().destination)
            bufferSource.buffer = sampleTones[pIndex][gridIndex][rowIndex]
            bufferSource.start()
          }

          paintAll()
          generateSound(pIndex)
          setEncodes()
        }
      })
    })
  })
}

const prepareDownload = () => {
  const newFile = URL.createObjectURL(bufferToWave(buffer, buffer.length))
  const link = document.querySelector('#download')
  link.href = newFile
  link.download = `${name}.wav`
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
  let beatString = encodeURIComponent(name).concat('|')

  beatString = beatString.concat(
    sequence.map(s => s.toString(16).toUpperCase().padStart(2, '0')).join('').concat('|')
  )

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

const generateSound = (pIndex, sequenceChanged=false, enableSave=true) => {
  if (startup) {
    startup = false
    return
  }

  if (pIndex && phraseBuffers.length === 0) pIndex = null

  generatePhraseBuffers(pIndex)
  generateSequence(sequenceChanged, enableSave)
  prepareDownload()  
}

const gatherColumns2 = () => {
  columns = []

  for (let i = 0; i < pData.length; i++) {
    columns[i] = []

    for (let j = 0; j < 16; j++) {
      columns[i][j] = []
    }
  }

  for (let i = 0; i < pData.length; i++) {
    for (let j = 0; j < pData[i].length; j++) {
      const grid = document.querySelector(`#grid${i}-${j}`)
      const elems = grid.querySelectorAll(':scope .d .b')

      forEach(elems, (m, elem) => {
        columns[i][m % 16].push(elem)
      })
    }
  }
}

const generateSampleTones = () => {
  if (startup) return
  if (bufferSizes.length < pData.length) generateSound()

  sampleTones = []

  for (let i = 0; i < pData.length; i++) {
    sampleTones[i] = []

    let bufferSize = bufferSizes[i]
    let subBufferSize = Math.round(bufferSize / 16) // just doing 16th notes in 4/4 FOR NOW

    for (let j = 0; j < notes[i].length; j++) {
      sampleTones[i][j] = []

      for (let k = 0; k < notes[i][j].length; k++) {
        let someArrayL = []
        let someArrayR = []
        let freq = notes[i][j][k]
        let samplesPerWave = parseInt(sampleRate / freq)
        let localIndex = 0
        let waveIndex = 0
        let lengthOffset = (1.0 - noteLengths[i][j]) * subBufferSize

        while (localIndex + lengthOffset < subBufferSize) {
          let sampleL = waveFunction(tones[i][j])(waveIndex, samplesPerWave)
          let sampleR = waveFunction(tones[i][j])(waveIndex, samplesPerWave)

          sampleL = sampleL * volumes[i][j] * (1 - pans[i][j] / 4)
          sampleR = sampleR * volumes[i][j] * (pans[i][j] / 4)

          if (sampleL > 1.0)
            sampleL = 1.0
          else if (sampleL < -1.0)
            sampleL = -1.0

          if (sampleR > 1.0)
            sampleR = 1.0
          else if (sampleR < -1.0)
            sampleR = -1.0

          someArrayL[localIndex] = sampleL
          someArrayR[localIndex] = sampleR

          waveIndex++
          localIndex++

          if (waveIndex >= samplesPerWave) waveIndex = 0
        }

        let carryover = 0

        while (waveIndex < samplesPerWave) {
          let sampleL = waveFunction(tones[i][j])(waveIndex, samplesPerWave)
          let sampleR = waveFunction(tones[i][j])(waveIndex, samplesPerWave)

          sampleL = sampleL * volumes[i][j] * (1 - pans[i][j] / 4)
          sampleR = sampleR * volumes[i][j] * (pans[i][j] / 4)

          if (sampleL > 1.0)
            sampleL = 1.0
          else if (sampleL < -1.0)
            sampleL = -1.0

          if (sampleR > 1.0)
            sampleR = 1.0
          else if (sampleR < -1.0)
            sampleR = -1.0

          someArrayL[localIndex] = sampleL
          someArrayR[localIndex] = sampleR

          localIndex++
          waveIndex++
          carryover++
        }

        let realBufferSize = subBufferSize + carryover
        let buffer = audioCtx().createBuffer(2, realBufferSize, sampleRate)
        let bufferingL = buffer.getChannelData(0)
        let bufferingR = buffer.getChannelData(1)

        for (let m = 0; m < realBufferSize; m++) {
          bufferingL[m] = someArrayL[m]
          bufferingR[m] = someArrayR[m]
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
    let someArrayL = Array(bufferSize).fill(0.0)
    let someArrayR = Array(bufferSize).fill(0.0)

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
            let valueL = someArrayL[bufferPointer + localIndex] || 0.0
            let valueR = someArrayR[bufferPointer + localIndex] || 0.0
            let sampleL = waveFunction(tones[pIndex][gridIndex])(waveIndex, samplesPerWave)
            let sampleR = waveFunction(tones[pIndex][gridIndex])(waveIndex, samplesPerWave)

            sampleL = sampleL * volumes[pIndex][gridIndex] * (1 - pans[pIndex][gridIndex] / 4)
            sampleR = sampleR * volumes[pIndex][gridIndex] * (pans[pIndex][gridIndex] / 4)

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
            let sampleL = waveFunction(tones[pIndex][gridIndex])(waveIndex, samplesPerWave)
            let sampleR = waveFunction(tones[pIndex][gridIndex])(waveIndex, samplesPerWave)

            sampleL = sampleL * volumes[pIndex][gridIndex] * (1 - pans[pIndex][gridIndex] / 4)
            sampleR = sampleR * volumes[pIndex][gridIndex] * (pans[pIndex][gridIndex] / 4)

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

      let buffer = audioCtx().createBuffer(2, someArrayL.length, sampleRate)
      let bufferingL = buffer.getChannelData(0)
      let bufferingR = buffer.getChannelData(1)

      for (let m = 0; m < someArrayL.length; m++) {
        bufferingL[m] = someArrayL[m]
        bufferingR[m] = someArrayR[m]
      }

      phraseBuffers[pIndex] = buffer
    })
  })
}

const generateSequence = (sequenceChanged=false, enableSave=true) => {
  let offset = 0
  let beatsPerMeasure = 4
  let bufferingL
  let bufferingR

  timeStops = []
  millisPer16ths = []
  totalMillis = 0

  if (sequenceChanged || !buffer) {
    let len = sequence.reduce((acc, seqNo) => acc = acc + phraseBuffers[seqNo - 1].length, 0)
    buffer = audioCtx().createBuffer(2, len, sampleRate)
  }

  bufferingL = buffer.getChannelData(0)
  bufferingR = buffer.getChannelData(1)

  if (!sequenceChanged) {
    for (let i = 0; i < bufferingL.length; i++) {
      bufferingL[i] = 0.0
      bufferingR[i] = 0.0
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

  let saveBtn = document.querySelector('#save')
  if (saveBtn && enableSave) {
    saveBtn.disabled = false
    document.querySelector('#saveNotice').style.visibility = 'hidden'
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
        td.classList.remove("gray")
      })
    }

    columns[phraseIndex][index].forEach(td => {
      td.classList.add("gray")
    })


    if (lastSequenceIndex !== sequenceIndex) {
      sequenceSelects[sequenceIndex].classList.add('gray')

      document.querySelector(`#phrase${phraseIndex}`).scrollIntoView()
      window.scrollBy(0, -(document.querySelector('#actions').offsetHeight))

      if (lastSequenceIndex !== null && lastSequenceIndex !== undefined) {
        sequenceSelects[lastSequenceIndex].classList.remove('gray')
      }
    }

    lastPlayheadPhrase = phraseIndex
    lastPlayheadIndex = index
    lastSequenceIndex = sequenceIndex
  }
}

const save = () => {
  let url = '/qwels'
  let method = 'POST'
  let qwelId
  let frenId
  let qwelFrenId
  let forkId
  let forkRep

  if (name === null || name === undefined || name.length === 0) {
    document.querySelector('#name').classList.add('error')
    return;
  }

  if (frenIdStr.length === 0) {
    return
  } else {
    frenId = parseInt(frenIdStr)
  }

  if (forkIdStr.length > 0) {
    forkId = parseInt(forkIdStr)
  }

  if (forkRepStr.length > 0) {
    forkRep = forkRepStr
  }

  if (qwelIdStr.length > 0) {
    if (qwelFrenIdStr.length === 0 && parseInt(qwelFrenIdStr) !== frenId) {
      console.error("Wrong fren.")
      return
    }
    
    qwelId = parseInt(qwelIdStr)

    url = url.concat(`/${qwelId}`)
    method = 'PUT'
  }

  let xhr = new XMLHttpRequest();
  xhr.open(method, url, true);
  xhr.setRequestHeader('Content-Type', 'application/json')
  xhr.onreadystatechange = function() {
    if (this.readyState != 4) return
    if (this.status == 200) {
      let data = JSON.parse(this.responseText)

      if (qwelId) {
        document.querySelector('#save').disabled = true
        document.querySelector('#saveNotice').style.visibility = 'visible'
      } else {
        window.location.href = `/qwels/${data.id}`
        document.querySelector('#saveNotice').style.visibility = 'visible'
      }
    } else {
      console.error("BAD: ", this.status, this.responseText)
    }
  }

  let bag = {
    name: name,
    rep: encoded,
    length: totalMillis,
    fren_id: frenId
  }

  if (method === 'POST' && forkId !== null && forkId !== undefined && forkRep !== null && forkRep !== undefined) {
    bag.fork_id = forkId
    bag.fork_rep = forkRep
  }

  xhr.send(JSON.stringify(bag));
}

const play = () => {
  stop()

  if (!phraseBuffers || !timeStops) {
    generateSound(null, true, false)
  }

  bufferSource = audioCtx().createBufferSource()
  bufferSource.connect(audioCtx().destination)
  bufferSource.buffer = buffer
  bufferSource.onended = () => {
    playing = false
    finishTimer()
    playButton.innerText = 'play'
    playButton.onclick = play
  }
  playing = true
  timerId = setInterval(highlightColumn, 20)
  timerStart = Date.now()
  bufferSource.start()
  playButton.innerText = 'stop'
  playButton.onclick = stop
}

const finishTimer = () => {
  clearInterval(timerId)

  timerId = null
  timerStart = null

  forEach(document.querySelectorAll('.b'), (i, td) => td.classList.remove('gray'))
  forEach(document.querySelectorAll('select.step'), (i, s) => s.classList.remove('gray'))

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
