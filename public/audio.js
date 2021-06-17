let bufferSource
let nowPlaying = null // id of the tune that is currently playing
let afterStop = null // callback to do work after bufferSource "onended" callback triggers
let loaded = null
let loadedId = null
let ptunes = []
let timerId
let timerStart
let lastPlayheadPhrase
let lastPlayheadIndex
let sequenceIndex
let phraseIndex
let lastSequenceIndex

const forEach = (array, callback, scope) => {
  for (let i = 0; i < array.length; i++) {
    callback.call(scope, i, array[i])
  }
}

const insertAfter = (newNode, existingNode) => {
  existingNode.parentNode.insertBefore(newNode, existingNode.nextSibling)
}

const togglePlay = (id, rep) => {
  let hint = document.querySelector(`#playHint${id}`)
  let prog = document.querySelector(`#progress${id}`)

  if (!bufferSource) {
    bufferSource = audioCtx().createBufferSource()
  }

  if (loaded === null || loaded === undefined || loadedId === null || loadedId === undefined || id !== loadedId) {
    if (!ptunes[id]) {
      ptunes[id] = new PTune(id, rep)
    }

    loaded = ptunes[id]
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
  bufferSource = audioCtx().createBufferSource()
  bufferSource.connect(audioCtx().destination)
  bufferSource.buffer = loaded.buffer()
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

const highlightColumn = () => {
  const elapsedTime = Date.now() - timerStart
  const millis = elapsedTime % loaded.totalMillis

  sequenceIndex = loaded.timeStops().findIndex(n => millis < n)
  let sequenceId = loaded.sequence()[sequenceIndex]
  phraseIndex = loaded.phrases().findIndex((p) => p.id === sequenceId )

  const index = Math.floor((millis - (loaded.timeStops()[sequenceIndex - 1] || 0)) / loaded.millisPer16ths[sequenceIndex]) % 16

  if (lastPlayheadIndex !== index || lastPlayheadPhrase !== phraseIndex) {
    if (lastPlayheadIndex !== null && lastPlayheadIndex !== undefined) {
      loaded.columns()[lastPlayheadPhrase][lastPlayheadIndex].forEach(td => {
        td.classList.remove("gray")
      })
    }

    loaded.columns()[phraseIndex][index].forEach(td => {
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
