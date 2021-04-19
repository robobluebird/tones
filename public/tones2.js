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
let reverbs
let phraseIds
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

let drums = {
  kick: kicks()
}

const remixThis = (tuneId) => {
}

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

const paintAll = () => {
  pData.forEach((phrase, pIndex) => {
    phrase.forEach((grid, index) => {
      const elem = document.querySelector(`#grid${pIndex}-${index}`)
      const cells = elem.querySelectorAll(':scope .d')

      forEach(cells, (i, cell) => {
        let b = cell.firstElementChild

        b.classList.remove("red", "green", "blue", "orange", "purple", "gold")

        if (pData[pIndex][index][i % 16] === Math.floor(i / 16)) {
          b.classList.add(toneClass(tones[pIndex][index] || 0))
        }
      })
    })
  })
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

  let newTone = parseInt(e.target.value)

  tones[pIndex][index] = newTone

  // if DRUM, disable octave and because laziness
  if (newTone === 5) {
    document.querySelector(`#octave${pIndex}-${index}`).disabled = true
    document.querySelector(`#notelength${pIndex}-${index}`).disabled = true
  } else {
    document.querySelector(`#octave${pIndex}-${index}`).disabled = false
    document.querySelector(`#notelength${pIndex}-${index}`).disabled = false
  }

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

const changeReverb = (e) => {
  const indexStr = e.target.id.slice(6)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const pIndex = indicies[0]
  const index = indicies[1]

  reverbs[pIndex][index] = parseInt(e.target.value)

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
  reverbs[pIndex].splice(index, 1)
  phraseIds[pIndex].splice(index, 1)
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
    let rev = cont.querySelector('select.reverb')

    cont.id = `container${pIndex}-${index}`
    tab.id = `grid${pIndex}-${index}`
    del.id = `delete${pIndex}-${index}`
    lis.id = `inst${pIndex}-${index}`
    oct.id = `octave${pIndex}-${index}`
    ntl.id = `notelength${pIndex}-${index}`
    vol.id = `volume${pIndex}-${index}`
    pan.id = `pan${pIndex}-${index}`
    rev.id = `reverb${pIndex}-${index}`

    index++
  }

  assignCellClicks()
  generateSound(pIndex)
  gatherColumns2()
  setEncodes()
}

const createPhrase = () => {
  const largestPhraseId = phraseIds.sort((a, b) => a - b)[phraseIds.length - 1]
  
  if (largestPhraseId === 255) return

  const phrases = document.querySelector('.phrases')
  const proto = document.querySelector("div.proto")
  const pIndex = pData.length
  const phraseId = largestPhraseId + 1

  let phraseContainer = document.createElement('div')
  phraseContainer.className = 'phrase'
  phraseContainer.id = `phrase${pIndex}`

  let phraseNo = document.createElement('div')
  phraseNo.innerText = phraseId
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

  let dupButton = document.createElement('button')
  dupButton.className = 'dupPhrase'
  dupButton.innerText = 'duplicate'
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
  phraseIds[pIndex] = phraseId
  octaves[pIndex] = []
  noteLengths[pIndex] = []
  reverbs[pIndex] = []
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
  let rev = gridContainer.querySelector('select.reverb')

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
  rev.id = `reverb${pIndex}-${gridIndex}`
  rev.onchange = changeReverb

  phraseContainer.insertBefore(gridContainer, add)

  pData[pIndex][gridIndex] = []
  tones[pIndex][gridIndex] = 1
  octaves[pIndex][gridIndex] = 3
  noteLengths[pIndex][gridIndex] = 1.0
  reverbs[pIndex][gridIndex] = 0
  volumes[pIndex][gridIndex] = 1.0
  pans[pIndex][gridIndex] = 2
  generateNotes(pIndex, gridIndex)
  paintAll()
  setInsts()
  setRoots()
  setOctaves()
  setNoteLengths()
  setReverbs()
  assignCellClicks()
  generateSound(pIndex)
  generateSampleTones()
  gatherColumns2()
  setEncodes()
}

const duplicatePhrase = (e) => {
  e.preventDefault()

  let pIndex = parseInt(e.target.id.slice(9))
  let encodedPhrase = encodePhrase(pIndex, true)

  if (encodedPhrase === null || encodedPhrase === undefined) return

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
  let r = document.querySelector('#rep')
  if (r) r.value = now

  
  if (tuneIdStr.length > 0) {
    if (userIdStr.length > 0 && tuneUserIdStr.length > 0 && tuneUserIdStr === userIdStr) {
      localStorage.setItem(tuneIdStr, now)
    }
  } else {
    localStorage.setItem('new', now)
  }
}

const deletePhrase = (e) => {
  e.preventDefault()

  if (pData.length === 1)
    return

  let pIndex = parseInt(e.target.id.slice(9))
  let parts = encodeAll().split('|')

  parts.splice(pIndex + 2, 1) // account for "sequence" and "name" data at position 0 of url parts
  parts[1] = parts[1].replaceAll((phraseIds[pIndex]).toString(16).toUpperCase().padStart(2, '0'), '') // remove from sequence too

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
    phraseNo.innerText = phraseIds[pIndex]

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

    let dupButton = document.createElement('button')
    dupButton.className = 'dupPhrase'
    dupButton.innerText = 'duplicate'
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
      let rev = gridContainer.querySelector('select.reverb')

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
      rev.id = `reverb${pIndex}-${gridIndex}`
      rev.onchange = changeReverb

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

      if (tone === 5) {
        document.querySelector(`#octave${pIndex}-${index}`).disabled = true
        document.querySelector(`#notelength${pIndex}-${index}`).disabled = true
      }
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

const setReverbs = () => {
  pData.forEach((phrase, pIndex) => {
    reverbs[pIndex].forEach((verb, index) => {
      let r = document.querySelector(`#reverb${pIndex}-${index}`)
      r.value = verb
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

    for (let i = 0; i < pData.length; i++) {
      let opt = document.createElement('option')
      opt.value = phraseIds[i]
      opt.text = phraseIds[i]
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
  phraseIds = []
  octaves = []
  noteLengths = []
  reverbs = []
  volumes = []
  pans = []
  sequence = []

  let fromParam = false

  if (encoded === null || encoded === undefined || encoded.length === 0) {
    // encoded does not yet exist meaning this is a new tune. Check for local save,
    // then params

    let maybeSaved = localStorage.getItem('new')

    if (maybeSaved) {
      encoded = maybeSaved
    } else {
      const params = (new URL(document.location)).searchParams
      const phraseParam = params.get('p')

      if (phraseParam !== null && phraseParam !== undefined) {
        encoded = phraseParam
      } else {
        encoded = ""
      }
    }
  } else {
    // encoded exists already which means this is a tune with an id and rep
    if (tuneUserIdStr.length > 0 && userIdStr.length > 0 && tuneUserIdStr === userIdStr) {
      // user is creator, load local changes????
      let maybeSaved = localStorage.getItem(tuneIdStr)

      if (maybeSaved) encoded = maybeSaved
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
      phraseIds[pIndex] = parseInt(pattern.slice(3, 5), 16)
      
      pData[pIndex] = []
      tones[pIndex] = []
      octaves[pIndex] = []
      noteLengths[pIndex] = []
      reverbs[pIndex] = []
      volumes[pIndex] = []
      pans[pIndex] = []
      notes[pIndex] = []

      patterns.forEach((pattern, index) => {
        pData[pIndex][index] = []

        if (!!pattern) {
          const tone       = parseInt(pattern[0])
          const octave     = parseInt(pattern[1])
          const noteLength = parseFloat([0.25, 0.5, 0.75, 1.0][parseInt(pattern[2])])
          const volume     = parseFloat([0.25, 0.5, 0.75, 1.0][parseInt(pattern[3])])
          const pan        = parseInt(pattern[4])
          const reverb     = parseInt(pattern[5])

          tones[pIndex][index] = tone
          octaves[pIndex][index] = octave
          noteLengths[pIndex][index] = noteLength
          reverbs[pIndex][index] = reverb
          volumes[pIndex][index] = volume
          pans[pIndex][index] = pan
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
    name = ""
    pData[0] = [[]]
    sequence = [1]
    bpms[0] = 110
    tones[0] = [1]
    rootNotes[0] = 'C'
    phraseIds[0] = 1
    octaves[0] = [3]
    noteLengths[0] = [1.0]
    reverbs[0] = [0]
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
  setReverbs()
  generateSampleTones()
  generateSound(null, true, false)
  gatherColumns2()
  setEncodes()

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

  let download = document.querySelector('#download')
  download.onclick = (e) => {
    if (!buffer) {
      generateSound(null, true, false)
    }

    const newFile = URL.createObjectURL(bufferToWave(buffer, buffer.length))
    e.target.href = newFile
    e.target.download = `${name || "quickloop"}.wav`
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

const encodePhrase = (pIndex, newPhraseId = false) => {
  let phrase = pData[pIndex]
  let beatString = ''

  beatString = beatString.concat(bpms[pIndex].toString(16).toUpperCase().padStart(2, '0'))
  beatString = beatString.concat(Object.keys(noteNamesAndFreqs).indexOf(rootNotes[pIndex]).toString(16))

  if (newPhraseId) {
    const largestPhraseId = phraseIds.sort((a, b) => a - b)[phraseIds.length - 1]

    if (largestPhraseId === 255) return

    beatString = beatString.concat((largestPhraseId + 1).toString(16).toUpperCase().padStart(2, '0'))
  } else {
    beatString = beatString.concat(phraseIds[pIndex].toString(16).toUpperCase().padStart(2, '0'))
  }

  beatString = beatString.concat(';')

  phrase.forEach((data, index) => {
    beatString = beatString.concat(tones[pIndex][index])
    beatString = beatString.concat(octaves[pIndex][index])
    beatString = beatString.concat([0.25, 0.5, 0.75, 1.0].indexOf(noteLengths[pIndex][index]))
    beatString = beatString.concat([0.25, 0.5, 0.75, 1.0].indexOf(volumes[pIndex][index]))
    beatString = beatString.concat(pans[pIndex][index])
    beatString = beatString.concat(reverbs[pIndex][index])

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
    beatString = beatString.concat(phraseIds[pIndex].toString(16).toUpperCase().padStart(2, '0'))
    beatString = beatString.concat(';')

    phrase.forEach((data, index) => {
      beatString = beatString.concat(tones[pIndex][index])
      beatString = beatString.concat(octaves[pIndex][index])
      beatString = beatString.concat([0.25, 0.5, 0.75, 1.0].indexOf(noteLengths[pIndex][index]))
      beatString = beatString.concat([0.25, 0.5, 0.75, 1.0].indexOf(volumes[pIndex][index]))
      beatString = beatString.concat(pans[pIndex][index])
      beatString = beatString.concat(reverbs[pIndex][index])

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

const generateSound = (pIndex, sequenceChanged=false, enableSave=true) => {
  if (startup) {
    startup = false
    return
  }

  if (pIndex && phraseBuffers.length === 0) pIndex = null

  generatePhraseBuffers(pIndex)
  generateSequence(sequenceChanged, enableSave)
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
        let isDrum = tones[i][j] === 5

        while (localIndex + lengthOffset < subBufferSize) {
          let sampleL, sampleR

          if (isDrum) {
            let dv = drums.kick[k][localIndex]

            if (dv === null || dv === undefined) dv = 0.0

            sampleL = dv
            sampleR = dv
          } else {
            sampleL = waveFunction(tones[i][j])(waveIndex, samplesPerWave)
            sampleR = waveFunction(tones[i][j])(waveIndex, samplesPerWave)
          }

          sampleL = sampleL * volumes[i][j] * (1 - pans[i][j] / 4)
          sampleR = sampleR * volumes[i][j] * (pans[i][j] / 4)

          if (localIndex < 220) {
            sampleL = sampleL * (localIndex / 220)
            sampleR = sampleR * (localIndex / 220)
          } else if (subBufferSize - (localIndex + lengthOffset) <= 220) {
            sampleL = sampleL * ((subBufferSize - (localIndex + lengthOffset)) / 220)
            sampleR = sampleR * ((subBufferSize - (localIndex + lengthOffset)) / 220)
          }

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

        let realBufferSize = someArrayL.length
        let pBuffer = audioCtx().createBuffer(2, realBufferSize, sampleRate)
        let bufferingL = pBuffer.getChannelData(0)
        let bufferingR = pBuffer.getChannelData(1)

        for (let m = 0; m < realBufferSize; m++) {
          bufferingL[m] = someArrayL[m]
          bufferingR[m] = someArrayR[m]
        }

        sampleTones[i][j][k] = pBuffer
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
      let tempL, tempR, reverbOffset, delay, decay

      if (reverbs[pIndex][gridIndex] > 0) {
        tempL = Array(bufferSize).fill(0.0)
        tempR = Array(bufferSize).fill(0.0)
        
        switch (reverbs[pIndex][gridIndex]) {
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

      phraseData.forEach((noteIndex, beatIndex) => {
        if (noteIndex !== null && noteIndex !== undefined) {
          let bufferPointer = beatIndex * subBufferSize // start of the "16th" subsection
          let rampIn = true
          let rampOut = true
          let localIndex = 0
          let isDrum = tones[pIndex][gridIndex] === 5

          if (beatIndex === lastIndex + 1 && !isDrum) {
            localIndex = carryover
            rampIn = false
          }

          if (phraseData[beatIndex + 1] !== undefined && phraseData[beatIndex + 1] !== null && !isDrum) {
            rampOut = false
          }

          let waveIndex = 0
          let lengthOffset = (1.0 - noteLengths[pIndex][gridIndex]) * subBufferSize

          freq = notes[pIndex][gridIndex][noteIndex]
          samplesPerWave = parseInt(sampleRate / freq)

          while (localIndex + lengthOffset < subBufferSize) {
            let sampleL, sampleR
            let valueL, valueR

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
              sampleL = waveFunction(tones[pIndex][gridIndex])(waveIndex, samplesPerWave)
              sampleR = waveFunction(tones[pIndex][gridIndex])(waveIndex, samplesPerWave)
            }

            sampleL = sampleL * volumes[pIndex][gridIndex] * (1 - pans[pIndex][gridIndex] / 4)
            sampleR = sampleR * volumes[pIndex][gridIndex] * (pans[pIndex][gridIndex] / 4)

            // "ramp" sound over 10ms for "non-continuation" tones to prevent audio pop
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
                sampleL = waveFunction(tones[pIndex][gridIndex])(waveIndex, samplesPerWave)
                sampleR = waveFunction(tones[pIndex][gridIndex])(waveIndex, samplesPerWave)
              }

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

      bufferSizes[pIndex] = someArrayL.length

      let pBuffer = audioCtx().createBuffer(2, someArrayL.length, sampleRate)
      let bufferingL = pBuffer.getChannelData(0)
      let bufferingR = pBuffer.getChannelData(1)

      for (let m = 0; m < someArrayL.length; m++) {
        bufferingL[m] = someArrayL[m]
        bufferingR[m] = someArrayR[m]
      }

      phraseBuffers[pIndex] = pBuffer
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
    let len = sequence.reduce((acc, seqNo) => acc = acc + phraseBuffers[phraseIds.indexOf(seqNo)].length, 0)
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
    let pIndex = phraseIds.indexOf(seqNo)
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
  phraseIndex = phraseIds.indexOf(sequence[sequenceIndex])

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
  let url = '/tunes'
  let method = 'POST'
  let tuneId
  let userId
  let tuneUserId
  let forkId
  let forkRep
  let token = document.querySelector('#authenticity_token').value

  if (name === null || name === undefined || name.length === 0) {
    document.querySelector('#name').classList.add('error')
    return;
  }

  if (userIdStr.length === 0) {
    return
  } else {
    userId = parseInt(userIdStr)
  }

  if (forkIdStr.length > 0) {
    forkId = parseInt(forkIdStr)
  }

  if (forkRepStr.length > 0) {
    forkRep = forkRepStr
  }

  if (tuneIdStr.length > 0) {
    if (tuneUserIdStr.length === 0 || (parseInt(tuneUserIdStr) !== userId)) {
      console.error("Wrong user.")
      return
    }
    
    tuneId = parseInt(tuneIdStr)

    url = url.concat(`/${tuneId}`)
    method = 'PUT'
  }

  let xhr = new XMLHttpRequest();
  xhr.open(method, url, true);
  xhr.setRequestHeader('Content-Type', 'application/json')
  xhr.setRequestHeader('X-CSRF-Token', token)
  xhr.onreadystatechange = function() {
    if (this.readyState != 4) return
    if (this.status == 200) {
      let data = JSON.parse(this.responseText)
      
      localStorage.removeItem(method === 'PUT' ? tuneIdSStr : 'new')

      if (tuneId) {
        document.querySelector('#save').disabled = true
        document.querySelector('#saveNotice').style.visibility = 'visible'
      } else {
        window.location.href = `/tunes/${data.id}`
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
    user_id: userId
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
