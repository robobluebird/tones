let audioCtxRef

const audioCtx = () => {
  if (audioCtxRef) {
    return audioCtxRef
  } else {
    audioCtxRef = new (window.AudioContext || window.webkitAudioContext)()
    unmute(audioCtxRef)
    return audioCtxRef
  }
}
