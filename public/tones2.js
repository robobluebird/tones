let ptune
let startup = true
let name = ""
let playing = false
let buffer
let bufferSource
let sampleNotes
let sequenceSelects
let playButton
let timerId
let timerStart
let lastPlayheadPhrase
let lastPlayheadIndex
let sequenceIndex
let phraseIndex
let lastSequenceIndex

const insertAfter = (newNode, existingNode) => {
  existingNode.parentNode.insertBefore(newNode, existingNode.nextSibling)
}

const paintAll = () => {
  ptune.phrases().forEach((phrase) => {
    phrase.grids.forEach((grid, gridIndex) => {
      const elem = document.querySelector(`#grid${phrase.id}-${gridIndex}`)
      const cells = [...elem.querySelectorAll(':scope .d')]

      cells.forEach((cell, cellIndex) => {
        let b = cell.firstElementChild
        let cellRow = Math.floor(cellIndex / 16)
        let cellCol = cellIndex % 16

        b.classList.remove("red", "green", "blue", "orange", "purple", "gold")

        if (grid.steps[cellCol] === cellRow) {
          b.classList.add(grid.toneClass())
        }
      })
    })
  })
}

const changeTempo = (e) => {
  const phraseId = parseInt(e.target.id.slice(3))
  const restart = playing

  stop()

  const phrase = ptune.phraseById(phraseId)
  phrase.setBpm(parseInt(e.target.value))
  ptune.buffer(true)
  if (restart) play()
  setEncodes()
}

const changeTone = (e) => {
  const indexStr = e.target.id.slice(4)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const phraseId = indicies[0]
  const gridIndex = indicies[1]
  const newTone = parseInt(e.target.value)
  const phrase = ptune.phraseById(phraseId)

  phrase.grids[gridIndex].setTone(newTone)

  // if DRUM, disable octave and because laziness
  if (newTone === 5) {
    document.querySelector(`#octave${phraseId}-${gridIndex}`).disabled = true
    document.querySelector(`#notelength${phraseId}-${gridIndex}`).disabled = true
  } else {
    document.querySelector(`#octave${phraseId}-${gridIndex}`).disabled = false
    document.querySelector(`#notelength${phraseId}-${gridIndex}`).disabled = false
  }

  paintAll() 
  ptune.buffer(true)
  setEncodes()
}

const changeOctave = (e) => {
  const indexStr = e.target.id.slice(6)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const phraseId = indicies[0]
  const gridIndex = indicies[1]
  const phrase = ptune.phraseById(phraseId)

  phrase.grids[gridIndex].setOctave(parseInt(e.target.value))

  paintAll()
  ptune.buffer(true)
  setEncodes()
}

const changeVolume = (e) => {
  const indexStr = e.target.id.slice(6)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const phraseId = indicies[0]
  const gridIndex = indicies[1]
  const phrase = ptune.phraseById(phraseId)

  phrase.grids[gridIndex].setVolume(parseFloat(e.target.value))

  paintAll()
  ptune.buffer(true)
  setEncodes()
}

const changePan = (e) => {
  const indexStr = e.target.id.slice(3)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const phraseId = indicies[0]
  const gridIndex = indicies[1]
  const phrase = ptune.phraseById(phraseId)

  phrase.grids[gridIndex].setPan(parseInt(e.target.value))

  paintAll()
  ptune.buffer(true)
  setEncodes()
}

const changeNoteLength = (e) => {
  const indexStr = e.target.id.slice(10)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const phraseId = indicies[0]
  const gridIndex = indicies[1]
  const phrase = ptune.phraseById(phraseId)

  phrase.grids[gridIndex].setLength(parseFloat(e.target.value))

  paintAll()
  ptune.buffer(true)
  setEncodes()
}

const changeReverb = (e) => {
  const indexStr = e.target.id.slice(6)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const phraseId = indicies[0]
  const gridIndex = indicies[1]
  const phrase = ptune.phraseById(phraseId)

  phrase.grids[gridIndex].setReverb(parseInt(e.target.value))

  paintAll()
  ptune.buffer(true)
  setEncodes()
}

const changeRoot = (e) => {
  const note = e.target.value
  const phraseId = parseInt(e.target.id.slice(3))
  const phrase = ptune.phraseById(phraseId)

  phrase.setRoot(note)

  // generate notes/sample tones for grids

  setNoteText(phrase)
  paintAll()
  ptune.buffer(true)
  setEncodes()
}

const setNoteText = (phrase) => {
  const phraseContainer = document.querySelector(`#phrase${phrase.id}`)
  const grids = [...phraseContainer.querySelectorAll(':scope div.t')]

  grids.forEach((gridContainer) => {
    const cells = [...gridContainer.querySelectorAll(':scope div.d')]

    cells.forEach((cell, cellIndex) => {
      if (cellIndex % 16 === 0) {
        let rowIndex = Math.floor(cellIndex / 16)

        if (rowIndex < phrase.noteNames().length) {
          cell.firstChild.firstChild.innerText = phrase.noteNames()[rowIndex]
        } else {
          cell.firstChild.firstChild.innerText = phrase.noteNames()[0]
        }
      }
    })
  })
}

const deleteGrid = (e) => {
  e.preventDefault()

  const indexStr = e.target.id.slice(6)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const phraseId = indicies[0]
  const phrase = ptune.phraseById(phraseId)

  let gridIndex = indicies[1]

  if (phrase.grids.length <= 1) {
    return
  }

  document.querySelector(`#container${phraseId}-${gridIndex}`).remove()

  phrase.deleteGrid(gridIndex)

  while (gridIndex < phrase.grids.length) {
    let cont = document.querySelector(`#container${phraseId}-${gridIndex + 1}`)
    let tab = cont.querySelector(`#grid${phraseId}-${gridIndex + 1}`)
    let del = cont.querySelector('a.delete')
    let lis = cont.querySelector('select.tone')
    let oct = cont.querySelector('select.octave')
    let ntl = cont.querySelector('select.notelength')
    let vol = cont.querySelector('select.volume')
    let pan = cont.querySelector('select.pan')
    let rev = cont.querySelector('select.reverb')

    cont.id = `container${phraseId}-${gridIndex}`
    tab.id = `grid${phraseId}-${gridIndex}`
    del.id = `delete${phraseId}-${gridIndex}`
    lis.id = `inst${phraseId}-${gridIndex}`
    oct.id = `octave${phraseId}-${gridIndex}`
    ntl.id = `notelength${phraseId}-${gridIndex}`
    vol.id = `volume${phraseId}-${gridIndex}`
    pan.id = `pan${phraseId}-${gridIndex}`
    rev.id = `reverb${phraseId}-${gridIndex}`

    gridIndex++
  }

  assignCellClicks()
  ptune.buffer(true)
  setEncodes()
}

const createPhrase = () => {
  const np = ptune.createPhrase()
  
  if (np === null) return

  const phrases = document.querySelector('.phrases')
  const proto = document.querySelector("div.proto")

  let phraseContainer = document.createElement('div')
  phraseContainer.className = 'phrase'
  phraseContainer.id = `phrase${np.id}`

  let phraseNo = document.createElement('div')
  phraseNo.className = 'phraseNo'
  phraseNo.id = `phraseNo${np.id}`
  phraseNo.innerText = np.id
  phraseNo.style.display = 'inline-block'
  phraseNo.style.marginBottom = '0.5em'

  let bpmContainer = document.createElement('div')
  bpmContainer.className = 'bpmAndSuch'

  let bpmLabel = document.createElement('label')
  bpmLabel.for = `bpm${np.id}`
  bpmLabel.innerText = 'bpm'
  bpmLabel.className = 'bpmLabel'

  let bpm = document.createElement('input')
  bpm.type = 'number'
  bpm.min = 40
  bpm.max = 200
  bpm.value = 120
  bpm.id = `bpm${np.id}`
  bpm.onchange = changeTempo

  let keyLabel = document.createElement('label')
  keyLabel.for = `key${np.id}`
  keyLabel.innerText = 'key'
  keyLabel.className = 'bpmLabel'

  let keySelect = document.createElement('select')
  keySelect.id = `key${np.id}`
  keySelect.onchange = changeRoot

  Object.keys(Sound.noteFrequencies).forEach(name => {
    let keyOpt = document.createElement('option')
    keyOpt.text = name
    keyOpt.value = name
    keySelect.add(keyOpt)
  })

  let dupButton = document.createElement('button')
  dupButton.className = 'dupPhrase'
  dupButton.innerText = 'duplicate'
  dupButton.id = `dupphrase${np.id}`
  dupButton.onclick = duplicatePhrase

  let delButton = document.createElement('a')
  delButton.href = '#'
  delButton.className = 'noStyle delPhrase'
  delButton.innerText = 'x'
  delButton.id = `delphrase${np.id}`
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
  add.id = `add${np.id}`
  add.onclick = createGrid
  add.innerText = '+'

  phraseContainer.appendChild(add)
  phrases.appendChild(phraseContainer)

  remakeSequenceSelects()
  createGrid({target: {id: `add${np.id}`}})
}

const createGrid = (e) => {
  const phrase = ptune.phraseById(parseInt(e.target.id.slice(3)))
  const gridIndex = phrase.createGrid()
  const proto = document.querySelector("div.proto")
  const phrases = document.querySelector('.phrases')

  let phraseContainer = document.querySelector(`#phrase${phrase.id}`)
  let gridContainer = proto.cloneNode(true)
  let deleteButton = gridContainer.querySelector('a.delete')
  let lis = gridContainer.querySelector('select.tone')
  let oct = gridContainer.querySelector('select.octave')
  let ntl = gridContainer.querySelector('select.notelength')
  let add = phraseContainer.querySelector(`#add${phrase.id}`)
  let vol = gridContainer.querySelector('select.volume')
  let pan = gridContainer.querySelector('select.pan')
  let rev = gridContainer.querySelector('select.reverb')
  let cop = gridContainer.querySelector('select.copy')

  gridContainer.classList.remove('proto')
  gridContainer.id = `container${phrase.id}-${gridIndex}`
  gridContainer.style.width = `20em`
  gridContainer.style.margin = '0 1em 0 0'

  let a = gridContainer.querySelector('.t')
  a.id = `grid${phrase.id}-${gridIndex}`

  let cells = [...a.querySelectorAll('.d')]
  cells.forEach((cell, i) => {
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

  deleteButton.id = `delete${phrase.id}-${gridIndex}`
  deleteButton.onclick = deleteGrid
  lis.id = `inst${phrase.id}-${gridIndex}`
  lis.onchange = changeTone
  oct.id = `octave${phrase.id}-${gridIndex}`
  oct.onchange = changeOctave
  ntl.id = `notelength${phrase.id}-${gridIndex}`
  ntl.onchange = changeNoteLength
  vol.id = `volume${phrase.id}-${gridIndex}`
  vol.onchange = changeVolume
  pan.id = `pan${phrase.id}-${gridIndex}`
  pan.onchange = changePan
  rev.id = `reverb${phrase.id}-${gridIndex}`
  rev.onchange = changeReverb
  cop.id = `copy${phrase.id}-${gridIndex}`
  cop.onchange = copyGridToPhrase

  phraseContainer.insertBefore(gridContainer, add)

  paintAll()
  setInsts()
  setRoots()
  setOctaves()
  setNoteLengths()
  setReverbs()
  assignCellClicks()
  populateGridCopiers()
  setEncodes()
}

const duplicatePhrase = (e) => {
  e.preventDefault()

  let phraseId = parseInt(e.target.id.slice(9))

  ptune.duplicatePhrase(phraseId)

  setEncodes()
  init()

  let asdf = [...document.querySelectorAll('.phrase')].pop()
  asdf.style.backgroundColor = 'rgba(0,255,0,0.5)'
  setTimeout(() => {
    asdf.style.backgroundColor = 'unset'
  }, 1000)
  asdf.scrollIntoView()
}

const setEncodes = (newEncoding) => {
  let now = encoded = newEncoding || ptune.encode()

  history.replaceState(null, '', `?p=${now}`)

  let r = document.querySelector('#rep')
  if (r) r.value = now

  let d = document.querySelector('#download')
  d.href = d.href.split('?')[0].concat('?rep=', now)
  d.download = decodeURIComponent(now.split('|')[0] || "quickloop") + '.wav'
  
  if (tuneIdStr.length > 0) {
    if (userIdStr.length > 0 && tuneUserIdStr.length > 0 && tuneUserIdStr === userIdStr) {
      localStorage.setItem(tuneIdStr, now)
    } else {
      localStorage.removeItem(tuneIdStr)
    }
  } else {
    localStorage.setItem('new', now)
  }
}

const deletePhrase = (e) => {
  e.preventDefault()

  if (ptune.phrases().length === 1)
    return

  const phraseId = parseInt(e.target.id.slice(9))

  ptune.deletePhraseById(phraseId)

  setEncodes()
  init()
}

const createPhrasesAndGrids = () => {
  const proto = document.querySelector("div.proto")
  const phrases = document.querySelector('.phrases')

  while (phrases.firstChild) phrases.removeChild(phrases.lastChild)

  ptune.phrases().forEach((p) => {
    let phraseContainer = document.createElement('div')
    phraseContainer.className = 'phrase'
    phraseContainer.id = `phrase${p.id}`
    phraseContainer.style.position = 'relative'

    let phraseNo = document.createElement('div')
    phraseNo.className = 'phraseNo'
    phraseNo.id = `phraseNo${p.id}`
    phraseNo.style.marginBottom = '0.5em'
    phraseNo.style.display = 'inline-block'
    phraseNo.innerText = p.id

    let bpmContainer = document.createElement('div')

    bpmContainer.className = 'bpmAndSuch'

    let bpmLabel = document.createElement('label')
    bpmLabel.for = `bpm${p.id}`
    bpmLabel.innerText = 'bpm'
    bpmLabel.className = 'bpmLabel'

    let bpm = document.createElement('input')
    bpm.type = 'number'
    bpm.min = 40
    bpm.max = 200
    bpm.value = p.bpm
    bpm.id = `bpm${p.id}`
    bpm.onchange = changeTempo

    let keyLabel = document.createElement('label')
    keyLabel.for = `key${p.id}`
    keyLabel.innerText = 'key'
    keyLabel.className = 'bpmLabel'

    let keySelect = document.createElement('select')
    keySelect.id = `key${p.id}`
    keySelect.onchange = changeRoot

    Object.keys(Sound.noteFrequencies).forEach(name => {
      let keyOpt = document.createElement('option')
      keyOpt.text = name
      keyOpt.value = name
      keySelect.add(keyOpt)
    })

    let dupButton = document.createElement('button')
    dupButton.className = 'dupPhrase'
    dupButton.innerText = 'duplicate'
    dupButton.id = `dupphrase${p.id}`
    dupButton.onclick = duplicatePhrase

    let delButton = document.createElement('a')
    delButton.href = '#'
    delButton.className = 'noStyle delPhrase'
    delButton.innerText = 'x'
    delButton.id = `delphrase${p.id}`
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

    p.grids.forEach((grid, gridIndex) => {
      let gridContainer = proto.cloneNode(true)
      gridContainer.style.width = `20em`
      gridContainer.style.margin = '0 1em 0 0'

      let a = gridContainer.querySelector('.t')
      a.id = `grid${p.id}-${gridIndex}`

      let cells = [...a.querySelectorAll('.d')]
      cells.forEach((cell, i) => {
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
      let cop = gridContainer.querySelector('select.copy')

      gridContainer.classList.remove('proto')
      gridContainer.id = `container${p.id}-${gridIndex}`
      deleteButton.id = `delete${p.id}-${gridIndex}`
      deleteButton.onclick = deleteGrid
      lis.id = `inst${p.id}-${gridIndex}`
      lis.onchange = changeTone
      oct.id = `octave${p.id}-${gridIndex}`
      oct.onchange = changeOctave
      ntl.id = `notelength${p.id}-${gridIndex}`
      ntl.onchange = changeNoteLength
      vol.id = `volume${p.id}-${gridIndex}`
      vol.onchange = changeVolume
      pan.id = `pan${p.id}-${gridIndex}`
      pan.onchange = changePan
      rev.id = `reverb${p.id}-${gridIndex}`
      rev.onchange = changeReverb
      cop.id = `copy${p.id}-${gridIndex}`
      cop.onchange = copyGridToPhrase

      phraseContainer.appendChild(gridContainer)
    })

    let add = document.createElement('div')
    add.className = 'add'
    add.id = `add${p.id}`
    add.onclick = createGrid
    add.innerText = '+'

    phraseContainer.appendChild(add)
    phrases.appendChild(phraseContainer)
  })
}

const copyGridToPhrase = (e) => {
  if (e.target.value === '-') return

  const indexStr = e.target.id.slice(4)
  const indicies = indexStr.split('-').map(n => parseInt(n))
  const fromPhraseId = indicies[0]
  const gridIndex = indicies[1]
  const toPhraseId = parseInt(e.target.value)

  const newGridIndex = ptune.copyGridToPhraseByIds(fromPhraseId, gridIndex, toPhraseId)

  setEncodes()
  init()

  const grid = document.querySelector(`#grid${fromPhraseId}-${gridIndex}`)
  document.querySelector(`#phrase${fromPhraseId}`).scrollLeft = grid.offsetLeft

  const toPhraseContainer = document.querySelector(`#phrase${toPhraseId}`)
  const newGridContainer = document.querySelector(`#grid${toPhraseId}-${newGridIndex}`)

  toPhraseContainer.scrollIntoView(false)
  toPhraseContainer.scrollLeft = newGridContainer.offsetLeft

  // hightlight phrase id and grid for a lil bit

  let phraseNo = document.querySelector(`#phraseNo${toPhraseId}`)
  const cont = document.querySelector(`#container${toPhraseId}-${newGridIndex}`)
  
  cont.style.backgroundColor = 'rgba(0,255,0,0.5)'
  phraseNo.style.backgroundColor = 'rgba(0,255,0,0.5)'
  
  setTimeout(() => {
    cont.style.backgroundColor = 'unset'
    phraseNo.style.backgroundColor = 'unset'
  }, 1000)
}

const setInsts = () => {
  ptune.phrases().forEach((phrase) => {
    phrase.grids.forEach((grid, index) => {
      let inst = document.querySelector(`#inst${phrase.id}-${index}`)
      inst.value = grid.tone

      if (grid.tone === 5) {
        document.querySelector(`#octave${phrase.id}-${index}`).disabled = true
        document.querySelector(`#notelength${phrase.id}-${index}`).disabled = true
      }
    })
  })
}

const setRoots = () => {
  ptune.phrases().forEach((phrase) => {
    let r = document.querySelector(`#key${phrase.id}`)
    r.value = phrase.root
    setNoteText(phrase)
  })
}

const setOctaves = () => {
  ptune.phrases().forEach((phrase) => {
    phrase.grids.forEach((grid, index) => {
      let o = document.querySelector(`#octave${phrase.id}-${index}`)
      o.value = grid.octave
    })
  })
}

const setNoteLengths = () => {
  ptune.phrases().forEach((phrase) => {
    phrase.grids.forEach((grid, index) => {
      let n = document.querySelector(`#notelength${phrase.id}-${index}`)
      n.value = grid.length.toString()
    })
  })
}

const setReverbs = () => {
  ptune.phrases().forEach((phrase) => {
    phrase.grids.forEach((grid, index) => {
      let r = document.querySelector(`#reverb${phrase.id}-${index}`)
      r.value = grid.reverb
    })
  })
}

const setVolumes = () => {
  ptune.phrases().forEach((phrase) => {
    phrase.grids.forEach((grid, index) => {
      let v = document.querySelector(`#volume${phrase.id}-${index}`)
      v.value = grid.volume.toString()
    })
  })
}

const setPans = () => {
  ptune.phrases().forEach((phrase) => {
    phrase.grids.forEach((grid, index) => {
      let p = document.querySelector(`#pan${phrase.id}-${index}`)
      p.value = grid.pan
    })
  })
}

const changeSequence = (e) => {
  let index = parseInt(e.target.id.slice(4))

  if (e.target.value === '-') {
    if (index < ptune.sequence().length) {
      ptune.setSequence(ptune.sequence().slice(0, index))
    }
  } else {
    ptune.assignSequence(index, parseInt(e.target.value))
  }

  remakeSequenceSelects()
  ptune.buffer(true)
  setEncodes()
}

const populateGridCopiers = () => {
  let pIds = ptune.phrases().map((p) => p.id)

  ptune.phrases().forEach((phrase) => {
    let pIdsWithoutThisPhrase = pIds.filter((p) => p != phrase.id)

    phrase.grids.forEach((grid, gridIndex) => {
      let select = document.querySelector(`#copy${phrase.id}-${gridIndex}`)

      while (select.firstChild) select.removeChild(select.lastChild)

      let options = pIdsWithoutThisPhrase.map((id) => {
        let option = document.createElement('option')
        option.value = id
        option.text = id
        return option
      })

      let option = document.createElement('option')
      option.text = '-'
      options.unshift(option)

      options.forEach(opt => select.add(opt))
    })
  })
}

const remakeSequenceSelects = () => {
  sequenceSelects = []

  let sequenceSteps = document.querySelector('#sequence')

  while (sequenceSteps.firstChild) sequenceSteps.removeChild(sequenceSteps.lastChild)

  ptune.sequence().concat('-').forEach((ps, index) => {
    let select = document.createElement('select')
    select.className = 'step'
    select.id = `step${index}`

    let opt = document.createElement('option')
    opt.text = '-'
    select.add(opt)

    ptune.phrases().forEach((phrase) => {
      let opt = document.createElement('option')
      opt.value = phrase.id
      opt.text = phrase.id
      select.add(opt)
    })

    select.value = ps
    select.onchange = changeSequence
    sequenceSteps.appendChild(select)
    sequenceSelects.push(select)
  })
}

const init = () => {
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
    ptune = new PTune(tuneIdStr, encoded)
  } else {
    ptune = new PTune()
  }

  ptune.buffer()

  createPhrasesAndGrids()
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
  populateGridCopiers()
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
    let lastName = name
    name = e.target.value
    name = name.replaceAll('|', '')

    if (name.length > 0) {
      e.target.classList.remove('error')
    }

    nameInput.value = name

    setEncodes()

    if (lastName !== name) {
      if (!phraseBuffers || !timeStops) {
        generateSound(null, true, false)
      }

      maybeShowSave()
    }
  }
}

const assignCellClicks = () => {
  const phrases = [...document.querySelectorAll('.phrase')]

  phrases.forEach((phraseContainer) => {
    const phraseId = parseInt(phraseContainer.id.slice(6))
    const phrase = ptune.phraseById(phraseId)
    const grids = [...phraseContainer.querySelectorAll('div.t')]

    grids.forEach((gridContainer) => {
      const indexStr = gridContainer.id.slice(5)
      const gridIndex = parseInt(indexStr.split('-')[1])
      const grid = phrase.grids[gridIndex]
      const cells = [...gridContainer.querySelectorAll(':scope div.d')]

      cells.forEach((cell, j) => {
        let rowIndex = Math.floor(j / 16)
        let dataIndex = j % 16

        cell.onclick = (e) => {
          e.preventDefault()

          if (grid.steps[dataIndex] === rowIndex) {
            grid.setStep(dataIndex, null)
          } else {
            grid.setStep(dataIndex, rowIndex)

            let bufferSource = audioCtx().createBufferSource()
            bufferSource.connect(audioCtx().destination)
            bufferSource.buffer = grid.tones()[rowIndex]
            bufferSource.start()
          }

          paintAll()
          ptune.buffer(true)
          setEncodes()
        }
      })
    })
  })
}

const maybeShowSave = (enableSave = true) => {
  let saveBtn = document.querySelector('#save')

  if (saveBtn && enableSave) {
    saveBtn.disabled = false
    document.querySelector('#saveNotice').style.visibility = 'hidden'
  }
}

const highlightColumn = () => {
  const elapsedTime = Date.now() - timerStart
  const millis = elapsedTime % ptune.totalMillis

  sequenceIndex = ptune.timeStops().findIndex(n => millis < n)
  let sequenceId = ptune.sequence()[sequenceIndex]
  phraseIndex = ptune.phrases().findIndex((p) => p.id === sequenceId) 

  const index = Math.floor((millis - (ptune.timeStops()[sequenceIndex - 1] || 0)) / ptune.millisPer16ths[sequenceIndex]) % 16

  if (lastPlayheadIndex !== index || lastPlayheadPhrase !== phraseIndex) {
    if (lastPlayheadIndex !== null && lastPlayheadIndex !== undefined) {
      ptune.columns()[lastPlayheadPhrase][lastPlayheadIndex].forEach(td => {
        td.classList.remove("gray")
      })
    }

    ptune.columns()[phraseIndex][index].forEach(td => {
      td.classList.add("gray")
    })


    if (lastSequenceIndex !== sequenceIndex) {
      sequenceSelects[sequenceIndex].classList.add('gray')

      document.querySelector(`#phrase${sequenceId}`).scrollIntoView()
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
      
      localStorage.removeItem(method === 'PUT' ? tuneIdStr : 'new')

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
    name: ptune.name,
    rep: ptune.encode(),
    length: ptune.totalMillis,
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

  bufferSource = audioCtx().createBufferSource()
  bufferSource.connect(audioCtx().destination)
  bufferSource.buffer = ptune.buffer()
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

  Array.from(document.querySelectorAll('.b')).forEach((td) => td.classList.remove('gray'))
  Array.from(document.querySelectorAll('select.step')).forEach((s) => s.classList.remove('gray'))

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
