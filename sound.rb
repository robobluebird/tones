require 'wavefile'

module Sound
  def tone_constant
    1.059463
  end

  def sample_rate
    22050
  end

  def note_frequencies
    {
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
  end
end

class WaveSample
  def initialize tone, samples_per_wave, multiplier = nil
    @tone = tone
    @samples_per_wave = samples_per_wave
    @multiplier = multiplier
  end

  def sample index
    case @tone
    when 0
      square index
    when 1
      sine index
    when 2
      triangle index
    when 3
      noise index
    when 4
      saw index
    else
      sine index
    end
  end

  def sine index
    Math.sin(index / (@samples_per_wave / (Math::PI * 2))) * (@multiplier || 0.8)
  end

  # todo: go back and figure out how the hell this works
  def saw index
    interval = @samples_per_wave / 2
    half_interval = interval / 2
    percent = ((index + half_interval) % interval) / interval.to_f
    ((0.6 * percent) - 0.3) * (@multiplier || 1.0)
  end

  def square index
    (index <= @samples_per_wave / 2 ? 1.0 : -1.0) * (@multiplier || 0.3)
  end

  def noise index
    value = sine index
    rand = Random.rand - 0.5
    value * rand * (@multiplier || 1.0)
  end

  def triangle index
    half = @samples_per_wave / 2
    quarter = @samples_per_wave / 4
    ramp = 1.0 / quarter
    m = @multiplier || 1.0

    if index <= half
      if index <= quarter
        index * ramp * m
      else
        (half - index) * ramp * m
      end
    else
      if index <= half + quarter
        -((index - half) * ramp) * m
      else
        -((@samples_per_wave - index) * ramp) * m
      end
    end
  end
end

class Drums
  def initialize
    generate!
  end

  def kick_sample note, index
    @drums[note][index]
  end

  def kick_length note
    @drums[note].length
  end

  def generate!
    base = 100

    @drums = (0..15).map do |i|
      sine_drum(base * (1 + (i * 0.25)))
    end.reverse
  end

  def sine_drum base_frequency
    changes = 10
    a = []

    changes.times do |i|
      calc = 1 - (i / changes.to_f)
      freq = base_frequency * calc
      samples_per_wave = (22050 / freq).floor

      5.times do |j|
        b = []

        samples_per_wave.times do |k|
          b[k] = WaveSample.new(1, samples_per_wave, calc).sample(k)
        end

        a = a + b
      end
    end

    a
  end
end

class Phrase
  attr_accessor :grids, :bpm, :root, :id
  attr_reader :buffer, :real_buffer_size

  include Sound

  def initialize
    @grids = []
  end

  def beats_per_measure
    4
  end

  def beats_per_second
    @bpm / 60.0
  end

  def seconds_per_beat
    1.0 / beats_per_second
  end

  def seconds
    seconds_per_beat * beats_per_measure
  end

  def buffer_size
    (seconds * sample_rate).to_i
  end

  def sub_buffer_size
    buffer_size / 16
  end

  def wave tone, wave_index, samples_per_wave
    WaveSample.new(tone, samples_per_wave).sample wave_index
  end

  def buffer
    @buffer ||= begin
      drums = Drums.new
      left_channel = Array.new buffer_size, 0.0
      right_channel = Array.new buffer_size, 0.0
      last_step = -1
      carry_over = 0

      @grids.each do |grid|
        grid.steps.each_with_index do |note, step|
          left_temp = Array.new(buffer_size, 0.0) if grid.reverb?
          right_temp = Array.new(buffer_size, 0.0) if grid.reverb?

          unless note.nil?
            buffer_pointer = step * sub_buffer_size
            local_index = 0
            wave_index = 0
            length_offset = (1 - grid.length) * sub_buffer_size
            frequency = grid.notes[note]
            samples_per_wave = (sample_rate / frequency).to_i

            if step == last_step + 1 && !grid.drum?
              local_index = carry_over
            end

            carry_over = 0

            while local_index + length_offset < sub_buffer_size ||
                  (grid.drum? && local_index < drums.kick_length(note)) ||
                  !wave_index.zero?
              left_value = (left_temp ? left_temp : left_channel)[buffer_pointer + local_index] || 0.0
              right_value = (right_temp ? right_temp : right_channel)[buffer_pointer + local_index] || 0.0

              if grid.drum?
                left_sample = right_sample = drums.kick_sample(note, local_index) || 0.0
              else
                left_sample = right_sample = wave grid.tone, wave_index, samples_per_wave
              end

              left_sample = left_sample * grid.volume * (1 - grid.pan / 4.0)
              right_sample = right_sample * grid.volume * (grid.pan / 4.0)

              left_value += left_sample
              right_value += right_sample

              if left_value > 1.0
                left_value = 1.0
              elsif left_value < -1.0
                left_value = -1.0
              end

              if right_value > 1.0
                right_value = 1.0
              elsif right_value < -1.0
                right_value = -1.0
              end

              (left_temp ? left_temp : left_channel)[buffer_pointer + local_index] = left_value
              (right_temp ? right_temp : right_channel)[buffer_pointer + local_index] = right_value

              wave_index += 1
              local_index += 1
              last_step = step
              carry_over += 1 if local_index + length_offset >= sub_buffer_size
              wave_index = 0 if wave_index >= samples_per_wave
            end

            # reverb
            if grid.reverb?
              offset = grid.reverb_offset
              decay = grid.decay

              i = 0
              while i < left_temp.length
                if i + offset < left_temp.length
                  verb_left = left_temp[i + offset]
                  verb_right = right_temp[i + offset]

                  verb_left += left_temp[i] * decay
                  verb_right += right_temp[i] * decay

                  if verb_left > 1.0
                    verb_left = 1.0
                  elsif verb_left < -1.0
                    verb_left = -1.0
                  end

                  if verb_right > 1.0
                    verb_right = 1.0
                  elsif verb_right < -1.0
                    verb_right = -1.0
                  end

                  left_temp[i + offset] = verb_left
                  right_temp[i + offset] = verb_right
                end

                left_value = left_channel[i]
                right_value = right_channel[i]

                left_value += left_temp[i]
                right_value += right_temp[i]

                if left_value > 1.0
                  left_value = 1.0
                elsif left_value < -1.0
                  left_value = -1.0
                end

                if right_value > 1.0
                  right_value = 1.0
                elsif right_value < -1.0
                  right_value = -1.0
                end

                left_channel[i] = left_value
                right_channel[i] = right_value
                
                i += 1
              end
            end
          end
        end
      end

      buffer = left_channel.zip right_channel
      @real_buffer_size = buffer.length
      buffer
    end
  end
end

class Grid
  attr_accessor :tone, :octave, :length, :reverb, :volume, :pan, :steps, :root

  include Sound

  def initialize
    @steps = [].fill nil, 0..15
  end

  def tone_class
    case @tone
    when 0
      'red'
    when 1
      'blue'
    when 2
      'green'
    when 3
      'orange'
    when 4
      'purple'
    when 5
      'gold'
    else
      'black'
    end
  end

  def reverb?
    @reverb > 0
  end

  def drum?
    tone == 5
  end

  def notes!
    @notes = nil
    notes
  end

  def notes
    @notes ||= begin
      notes = [].fill(nil, 0..11)

      octave_shift = tone_constant ** 12
      shift_count = 0

      if @octave < 4
        octave_shift = 1 / octave_shift
        shift_count = 4 - @octave
      elsif @octave > 4
        shift_count = @octave - 4
      end

      root_freq = note_frequencies[@root]
      shift_count.times { root_freq = root_freq * octave_shift }

      notes[12] = root_freq

      i = 12
      while i > 0
        notes[12 - i] = generate_note_frequency(i, root_freq)
        i -= 1
      end

      notes
    end
  end

  def generate_note_frequency index, root
    i = 0
    while i < index
      root = root * tone_constant
      i += 1
    end

    root
  end

  def delay
    @reverb.zero? ? 0.0 : 0.1
  end

  def decay
    case @reverb
    when 0
      0.0
    when 1
      0.25
    when 2
      0.5
    when 3
      0.75
    else
      0.0
    end
  end

  def reverb_offset
    (sample_rate * delay).floor
  end
end

class PTune
  attr_reader :tune, :buffers, :sequence, :sound, :phrases, :name

  include Sound

  def initialize tune, rep_only = nil
    @tune = tune
    @rep = rep_only
    @phrases = parse!
  end

  def ideal_square
    total = @phrases.reduce(0) do |acc, curr|
      acc + curr.grids.length
    end
      
    ideal_square = 1
  
    while (ideal_square ** 2 < total) do
      ideal_square += 1
    end

    ideal_square
  end

  def ideal_grid_width
    "#{1.0 / ideal_square * 100}%"
  end

  def rep
    @tune ? @tune.rep : @rep
  end

  def parse!
    parsed = {}
    phrases = rep.split '|'

    @name = CGI.unescape phrases.shift
    @sequence = phrases.shift.scan(/.{1,2}/).map { |h| h.to_i 16 }
    
    phrases.map do |phrase|
      p = Phrase.new

      patterns = phrase.split ';'
      phrase_info = patterns.shift

      p.bpm = phrase_info[0..1].to_i 16
      p.root = note_frequencies.keys[phrase_info[2].to_i(16)]
      p.id = phrase_info[3..4].to_i 16
      p.grids = patterns.map do |pattern, index|
        next if pattern.length.zero?

        g = Grid.new

        g.root = p.root
        g.tone = pattern[0].to_i
        g.octave = pattern[1].to_i
        g.length = [0.25, 0.5, 0.75, 1.0][pattern[2].to_i]
        g.volume = [0.25, 0.5, 0.75, 1.0][pattern[3].to_i]
        g.pan = pattern[4].to_i
        g.reverb = pattern[5].to_i
        g.notes!

        if pattern.length > 6
          pattern[6..-1]
          .scan(/.{1,2}/)
          .each do |row|
            col = row[0].to_i(16)
            note = row[1].to_i(16)
            g.steps[col] = note 
          end
        end

        g
      end

      p
    end
  end

  def sound!
    buffers!
    sequence!
  end

  def buffers!
    @phrases.each(&:buffer)
  end

  def sequence!
    offset = 0

    tune_buffer_length = @sequence.reduce(0) do |acc, seq_num|
      acc + @phrases.find { |p| p.id == seq_num }.buffer_size
    end

    left_channel = Array.new tune_buffer_length, 0.0
    right_channel = Array.new tune_buffer_length, 0.0

    @sequence.each do |seq_num|
      phrase = @phrases.find { |p| p.id == seq_num }
      phrase.buffer.each_with_index do |sample, index|
        break if offset + index >= tune_buffer_length

        l = left_channel[offset + index]
        r = right_channel[offset + index]

        l += sample[0]
        r += sample[1]

        if l > 1.0
          l = 1.0
        elsif l < -1.0
          l = -1.0
        end

        if r > 1.0
          r = 1.0
        elsif r < -1.0
          r = -1.0
        end

        left_channel[offset + index] = l
        right_channel[offset + index] = r
      end

      offset += phrase.buffer_size
    end

    @sound = left_channel.zip right_channel
  end

  def wav
    sound! unless @sound

    buffer = WaveFile::Buffer.new @sound, WaveFile::Format.new(:stereo, :float, 22050)
    tempfile = Tempfile.new ['', '.wav']

    WaveFile::Writer.new(tempfile, WaveFile::Format.new(:stereo, :pcm_16, 22050)) do |writer|
      writer.write(buffer)
    end

    tempfile
  end

  def mp3
  end
end
