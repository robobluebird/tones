const fs = require("fs")

let drums = JSON.parse(fs.readFileSync('out-5.json', 'utf8'));

Object.keys(drums).forEach((key, index) => {
  let ary = drums[key].map((sample, index) => [parseFloat(sample.toPrecision(3)), index])

  // code for finding + and - "peaks"
  ary = ary.filter((elem, index, arr) => index === 0 || index === ary.length - 1 || (elem[0] > ary[index - 1][0] && elem[0] > ary[index + 1][0]) || (elem[0] < ary[index - 1][0] && elem[0] < ary[index + 1][0]))

  // given "peaks", keep only 1 peak per zero crossing
  let i = 0
  const keep = []
  while (i < ary.length) {
    if (i == 0) {
      keep.push(ary[i])
    } else if (ary[i][0] > 0 && keep[keep.length - 1][0] > 0 && ary[i][0] > keep[keep.length - 1][0]) {
      keep.pop()
      keep.push(ary[i])
    } else if (ary[i][0] < 0 && keep[keep.length - 1][0] < 0 && ary[i][0] < keep[keep.length - 1][0]) {
      keep.pop()
      keep.push(ary[i])
    } else if ((ary[i][0] > 0 && keep[keep.length - 1][0] < 0) || (ary[i][0] < 0 && keep[keep.length - 1][0] > 0)) {
      keep.push(ary[i])
    }

    i++
  }

  console.log(keep)
  
  drums[key] = keep
})

fs.writeFileSync('minidrums.json', JSON.stringify(drums))
