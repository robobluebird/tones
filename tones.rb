require 'bazaar'
require 'bcrypt'
require 'sinatra'
require 'sqlite3'
require 'time'

include BCrypt

enable :sessions

class String; def humanize; self.capitalize; end; end

helpers do
  def error_for code
    code.nil? ? '' : [
      'Provide both a name and password.',
      'Bad passsword.',
      'No such fren.',
      'Provide a name, password, and password confirmation.',
      'Trying to trick me?',
      "Password and confirmation don't match.",
      'That name is taken.',
      'Only alphanumerics, dashes ("-"), or underscores ("_") for name please.',
      'Please limit name to 32 characters or less'
    ][code.to_i]
  end

  def chron time
    t = ((Time.now.utc - time).to_i / 86400).floor

    case t
    when 0
      time.strftime '%l:%M%P'
    when 1
      "#{time.strftime('%l:%M%P')} yesterday"
    else
      if time.year === Time.now.utc.year
        time.strftime('%b %e, %l:%M%P')
      else
        time.strftime('%b %e, %Y, %l:%M%P')
      end
    end
  end

  def db
    @db ||= begin
      db = SQLite3::Database.new "ql5.db"

      db.execute_batch <<-SQL
        create table if not exists looks (
          id integer primary key,
          rep text
        );

        create table if not exists frens (
          id integer primary key,
          name text unique,
          password_hash text,
          look text,
          last_login date
        );

        create table if not exists poasts (
          id integer primary key,
          title text,
          body text,
          look text,
          fren_id integer,
          poast_id integer,
          created_at date,
          foreign key(fren_id) references frens(id),
          foreign key(poast_id) references poasts(id)
        );

        create table if not exists remixes (
          id integer primary key,
          snapshot text,
          qwel_id integer,
          fren_id integer,
          created_at date,
          foreign key(qwel_id) references qwels(id),
          foreign key(fren_id) references frens(id)
        );

        create table if not exists qwels (
          id integer primary key,
          name text,
          rep text,
          length integer,
          look text,
          created_at date,
          updated_at date,
          fren_id integer,
          remix_id integer,
          foreign key(fren_id) references frens(id),
          foreign key(remix_id) references remixes(id)
        );

        create table if not exists comments (
          id integer primary key,
          body text,
          look text,
          created_at date,
          qwel_id integer,
          fren_id integer,
          foreign key(qwel_id) references qwels(id),
          foreign key(fren_id) references frens(id)
        );

        create table if not exists likes (
          id integer primary key,
          look text,
          fren_id integer,
          qwel_id integer,
          foreign key(fren_id) references frens(id),
          foreign key(qwel_id) references qwels(id)
        );
      SQL

      db
    end
  end

  def current_fren 
    if session[:fren_id]
      @fren ||= Fren.new db.execute("select id, name, look, last_login from frens where id = ?", session[:fren_id]).first
    end
  end

  def page
    @page ||= params[:page] ? params[:page].to_i : 1
  end

  def page_size
    @page_size ||= 2
  end

  def page_count
    @page_count ||= [(db.execute("select count(id) from qwels").first.first.to_f / page_size).ceil, 1].max
  end

  def sort
    @sort ||= params[:sort].to_i
  end

  def title
    @title
  end

  def xhr?
    request.xhr? || request.content_type == "application/json"
  end

  def get_qwel id
    q = db.execute("select id, name, rep, length, look, fren_id, created_at, updated_at, remix_id from qwels where id = ? limit 1", id).first

    Qwel.new(q) if q
  end

  def get_fren id
    f = db.execute('select id, name, look, last_login, password_hash from frens where id = ? limit 1', id).first

    Fren.new(f) if f
  end

  def get_fren_by_name name
    f = db.execute('select id, name, look, last_login, password_hash from frens where name = ? limit 1', name).first

    Fren.new(f) if f
  end

  def get_poasts parent_id = nil, id = nil
    query = if parent_id
              'select * from poasts where poast_id = ? order by created_at asc'
            elsif id
              'select * from poasts where id = ? limit 1'
            else
              'select * from poasts where poast_id is null order by created_at desc'
            end

    db.execute(query, parent_id || id).map do |p|
      n = Poast.new p
      n.fren = get_fren(n.fren_id) if n.fren_id
      n
    end
  end
end

before do
  if xhr?
    request.body.rewind
    params.merge! JSON.parse(request.body.read).transform_keys(&:to_sym)
  end
end

class Fren
  attr_reader :id, :name, :look, :last_login, :password_hash

  def initialize ary = nil
    if ary.respond_to?(:each)
      @id = ary[0]
      @name = ary[1]
      @look = ary[2]
      @last_login = Time.parse(ary[3]) if ary[3]
      @password_hash = ary[4]
    end
  end
end

class Comment
  attr_reader :id, :body, :look, :fren_id, :qwel_id, :created_at
  attr_accessor :fren, :qwel

  def initialize ary = nil
    @id = ary[0]
    @body = ary[1]
    @look = ary[2]
    @fren_id = ary[3]
    @qwel_id = ary[4]
    @created_at = Time.parse(ary[5]) if ary[5]
  end
end

class Poast
  attr_reader :id, :title, :body, :look, :fren_id, :poast_id, :created_at
  attr_accessor :fren, :poast, :replies

  def initialize ary = nil
    @id = ary[0]
    @title = ary[1]
    @body = ary[2]
    @look = ary[3]
    @fren_id = ary[4]
    @poast_id = ary[5]
    @created_at = Time.parse(ary[6]) if ary[6]
    @replies = []
  end

  def parsed
    parsed = []
    parts = @body.split("'''")

    if parts.length > 2
      i = 1
      while i < parts.length - 1
        l = parts[i].strip
        unless l.empty?
          parsed.push (i % 2).odd? ? [:q, l] : [:l, l]
        end
        i += 1
      end
      f = parts.first.strip
      l = parts.last.strip
      parsed.unshift [:l, f] unless f.empty?
      parsed.push [:l, l] unless l.empty?
      parsed
    else
      [[:l, parts.first.strip]]
    end
  end
end

class Remix 
  attr_reader :id, :qwel_id, :fren_id, :snapshot, :created_at
  attr_accessor :qwel, :fren

  def initialize ary = nil
    if ary.respond_to?(:each)
      @id = ary[0]
      @qwel_id = ary[1]
      @fren_id = ary[2]
      @snapshot = ary[3]
    end
  end
end

class Qwel
  attr_reader :id, :name, :rep, :length, :tags, :likes, :fren_id, :remix_id, :created_at, :updated_at
  attr_accessor :fren, :likes, :length, :comments, :remixes, :remixed_from

  def initialize ary = nil
    if ary.respond_to?(:each)
      @id = ary[0]
      @name = ary[1]
      @rep = ary[2]
      @length = ary[3]
      @look = ary[4]
      @fren_id = ary[5]
      @created_at = Time.parse(ary[6]) if ary[6]
      @updated_at = Time.parse(ary[7]) if ary[7]
      @remix_id = ary[8]
      @like_count = ary[9]
    else
      @rep = ""
    end

    @likes = []
    @comments = []
    @remixes = []
  end

  def liked_by? fren_id_or_fren
    f = fren_id_or_fren.is_a?(Fren) ? fren_id_or_fren.id : fren_id_or_fren

    !!@likes.find { |l| l.fren_id && l.fren_id == f }
  end

  def remixed_by? fren_id_or_fren
    f = fren_id_or_fren.is_a?(Fren) ? fren_id_or_fren.id : fren_id_or_fren

    !!@remixes.find { |f| f.fren_id && f.fren_id == f }
  end
end

class Like
  attr_reader :id, :look, :qwel_id, :fren_id

  def initialize ary
    @id = ary[0]
    @look = ary[1]
    @qwel_id = ary[2]
    @fren_id = ary[3]
  end
end

def discern_title fren = nil
  t = case sort
      when 0
        'freshest tracks'
      when 1
        'newest tracks'
      when 2
        'most liked tracks'
      when 3
        'longest tracks'
      when 4
        'shortest tracks'
      else
        'freshest'
      end

  t = "#{fren.name}'s #{t}" if fren
  t
end

def random_id no = nil
  s = db.execute("select count(id) from qwels").first.first

  return if s.zero?

  r = Random.new.rand(1..s)

  while r == no do r = Random.new.rand(1..s) end

  r
end

def get_comments qwel_id = nil, comment_id = nil
  w = if qwel_id
        ' where comments.qwel_id = ? '
      elsif comment_id
        ' where comments.id = ? '
      else
        ' '
      end

  cres = db.execute "select comments.id, body, comments.look, fren_id, qwel_id, created_at, frens.id, name, frens.look from comments inner join frens on frens.id = comments.fren_id#{w}order by created_at desc", qwel_id || comment_id

  cres.map do |c|
    com = Comment.new c[0..5]
    com.fren = Fren.new c[6..8]
    com
  end
end

def qwels_with_frens_and_like_counts fren_id = nil, id = nil, like_fren_id = nil
  s = case sort
      when 0
        'qwels.updated_at desc'
      when 1
        'qwels.created_at desc'
      when 2
        'like_count desc'
      when 3
        'qwels.length desc'
      when 4
        'qwels.length asc'
      else
        'qwels.updated_at desc'
      end

  f = if like_fren_id
        " where likes.fren_id = #{like_fren_id} "
      elsif id
        " where qwels.id = #{id} "
      elsif fren_id
        " where qwels.fren_id = #{fren_id} "
      else
        ' '
      end

  q = "select qwels.id, qwels.name, rep, length, qwels.look, qwels.fren_id, created_at, updated_at, remix_id, count(likes.qwel_id) as like_count, frens.id, frens.name, frens.look from qwels inner join frens on qwels.fren_id = frens.id left join likes on qwels.id = likes.qwel_id#{f}group by qwels.id order by #{s} limit #{page_size * (page - 1)}, #{page_size}"

  db.execute(q).map do |row|
    q = Qwel.new row[0..9]
    q.fren = Fren.new row[10..12]
    q.comments = get_comments q.id

    q.likes = db.execute('select id, look, qwel_id, fren_id from likes where qwel_id = ?', q.id).map { |l| Like.new l }

    q.remixes = db.execute('select id, qwel_id, fren_id, snapshot from remixes where qwel_id = ?', q.id).map { |f| Remix.new f }

    if q.remix_id
      qfres = db.execute('select qwels.id, qwels.name, frens.id, frens.name, frens.look from qwels inner join frens on qwels.fren_id = frens.id inner join remixes on qwels.id = remixes.qwel_id where remixes.id = ? limit 1', q.remix_id).first

      qf = Qwel.new qfres[0..1]
      qf.fren = Fren.new qfres[2..4]

      q.remixed_from = qf
    end

    q
  end
end

get '/random' do
  id = params[:i] ? params[:i].to_i : random_id(params[:r].to_i)
  
  @qwel = qwels_with_frens_and_like_counts(nil, id).first

  erb :random
end

get '/' do
  @qwels = qwels_with_frens_and_like_counts

  erb :qwels
end

get '/frens/:fren_id/qwels' do
  @page_count = [
    db.execute("select count(id) from qwels where fren_id = ?", params[:fren_id]).first.first / page_size,
    1
  ].max

  @visit_fren = Fren.new db.execute('select id, name, look from frens where id = ?', params[:fren_id]).first
  @qwels = qwels_with_frens_and_like_counts @visit_fren.id
  @title = "#{@visit_fren.name}'s qwels"

  erb :qwels
end

get '/frens/:fren_id/likes' do
  @page_count = [
    db.execute("select count(id) from likes where fren_id = ?", params[:fren_id]).first.first / page_size,
    1
  ].max

  @visit_fren = Fren.new db.execute('select id, name, look from frens where id = ?', params[:fren_id]).first
  @qwels = qwels_with_frens_and_like_counts nil, nil, params[:fren_id]
  @title = "qwels #{@visit_fren.name} likes"

  erb :qwels
end

get '/frens/new' do
  erb :new_fren
end

get '/frens/:fren_id' do
  @visit_fren = Fren.new db.execute('select id, name, look from frens where id = ?', params[:fren_id]).first
  erb :fren
end

get '/frens/:fren_id/look' do
  look = db.execute('select look from frens where id = ?', params[:fren_id]).first.first
  erb :just_look, locals: {
    look: look,
    editable: current_fren && current_fren.id == params[:fren_id].to_i,
    editNow: look.nil?,
    form_action: "/frens/#{params[:fren_id]}/look",
    form_method: "post"
  }
end

post '/frens/:fren_id/look' do
  if current_fren && current_fren.id == params[:fren_id].to_i
    db.execute 'update frens set look = ? where id = ?', [params[:look], params[:fren_id]]
  end

  redirect to back
end

post '/login' do
  if !params[:name] || !params[:password] || params[:name].length.zero? || params[:password].length.zero?
    redirect to("/frens/new?name=#{params[:name]}&=e=0")
  end

  f = get_fren_by_name params[:name]

  if f && f.name
    if Password.new(f.password_hash) == params[:password]
      db.execute 'update frens set last_login = ? where id = ?', [Time.now.utc.to_s, f.id]
      session[:fren_id] = f.id
      
      if f.look.nil?
        redirect to("/frens/#{f.id}/look")
      else
        redirect to('/')
      end
    else
      redirect to("/frens/new?name=#{f.name}&e=1")
    end
  else
    redirect to("/frens/new?e=2")
  end
end

post '/frens' do
  if !params[:name] || !params[:password] || !params[:password_confirmation] ||
    params[:name].length.zero? || params[:password].length.zero? || params[:password_confirmation].length.zero?
    redirect to("/frens/new?name=#{params[:name]}&p=SignUp&e=3")
  elsif !params[:name].match(/^[a-zA-Z0-9\-_]+$/)
    redirect to("/frens/new?p=SignUp&e=7")
  elsif params[:name].length > 32
    redirect to("/frens/new?name=#{params[:name]}&p=SignUp&e=8")
  elsif params[:password_confirmation] != params[:password]
    redirect to("/frens/new?name=#{params[:name]}&p=SignUp&e=5")
  else
    f = get_fren_by_name params[:name]

    if f
      redirect to("/frens/new?name=#{params[:name]}&p=SignUp&e=6")
    end
  end

  db.execute 'insert into frens (name, password_hash, last_login) values (?, ?, ?)',
    [params[:name], Password.create(params[:password]), Time.now.utc.to_s]
  session[:fren_id] = db.last_insert_row_id
  redirect to("/frens/#{db.last_insert_row_id}/look")
end

get '/error' do
end

get '/qwels' do
end

get '/qwels/new' do
  @qwel = Qwel.new

  erb :qwel, layout: :qwel_layout
end

get '/qwels/:qwel_id' do
  @qwel = get_qwel params[:qwel_id]

  erb :qwel, layout: :qwel_layout
end

post '/qwels' do
  unless params[:name].to_s.length > 0 && params[:rep].to_s.length > 0 &&
         params[:length].is_a?(Numeric) && params[:fren_id].is_a?(Numeric)
    halt 500
  end

  t = Time.now.utc.to_s

  db.execute 'insert into qwels (name, rep, length, fren_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)', params.values_at(:name, :rep, :length, :fren_id) + [t, t]

  { id: db.last_insert_row_id }.to_json
end

put '/qwels/:qwel_id' do
  res = db.execute("select fren_id from qwels where id = #{params[:qwel_id]} limit 1").first

  halt(404) if res.nil?
  halt(401) if res[0] != current_fren.id 

  db.execute "update qwels set name = ?, rep = ?, length = ?, updated_at = ? where id = #{params[:qwel_id]}", params.values_at(:name, :rep, :length) + [Time.now.utc.to_s]

  { id: params[:qwel_id] }.to_json
end

post '/qwels/:qwel_id/remix' do
  q = get_qwel params[:qwel_id]

  t = Time.now.utc.to_s

  db.execute 'insert into remixes (snapshot, qwel_id, fren_id, created_at) values (?, ?, ?, ?)', [q.rep, q.id, current_fren.id, t]

  t = Time.now.utc.to_s
  name = "#{current_fren.name}'s #{q.name} remix"

  rep = q.rep.split '|'
  rep[0] = URI.escape(name, Regexp.new("[^#{URI::PATTERN::UNRESERVED}]"))
  rep = rep.join '|'

  db.execute 'insert into qwels (name, rep, length, fren_id, remix_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)', [name, rep, q.length, current_fren.id, db.last_insert_row_id, t, t]

  redirect to("/qwels/#{db.last_insert_row_id}")
end

get '/logout' do
  session[:fren_id] = nil
  redirect to('/')
end

post '/qwels/:qwel_id/comments' do
  unless params[:body] &&
         params[:fren_id] &&
         params[:qwel_id] &&
         current_fren &&
         current_fren.id == params[:fren_id].to_i
    halt 400
  end
  
  db.execute 'insert into comments (body, fren_id, qwel_id, created_at) values (?, ?, ?, ?)', [params[:body], params[:fren_id], params[:qwel_id], Time.now.utc.to_s]

  if xhr?
    c = get_comments(nil, db.last_insert_row_id).first

    {commentHtml: erb(:comment, {layout: false, locals: {comment: c}})}.to_json
  else
    if back.include? 'random'
      redirect to("/random?i=#{params[:qwel_id]}#m#{params[:qwel_id]}")
    else
      redirect to("#{back}#m#{params[:qwel_id]}")
    end
  end
end

post '/qwels/:qwel_id/likes' do
  unless params[:fren_id] &&
         params[:qwel_id] &&
         current_fren &&
         current_fren.id == params[:fren_id].to_i
    halt 400
  end
  
  db.execute 'insert into likes (fren_id, qwel_id) values (?, ?)', [params[:fren_id], params[:qwel_id]]

  if xhr?
    q = get_qwel params[:qwel_id]
    q.likes = db.execute('select id, look, qwel_id, fren_id from likes where qwel_id = ?', q.id).map { |l| Like.new l }
      
    {likeHtml: erb(:like_info, {layout: false, locals: {qwel: q}})}.to_json
  else
    if back.include? 'random'
      redirect to("/random?i=#{params[:qwel_id]}#q#{params[:qwel_id]}")
    else
      redirect to("#{back}#q#{params[:qwel_id]}")
    end
  end
end

post '/qwels/:qwel_id/delete_likes' do
  unless params[:fren_id] &&
         params[:qwel_id] &&
         current_fren &&
         current_fren.id == params[:fren_id].to_i
    halt 400
  end

  db.execute 'delete from likes where fren_id = ? and qwel_id = ?', [params[:fren_id], params[:qwel_id]]

  if xhr?
    q = get_qwel params[:qwel_id]
    q.likes = db.execute('select id, look, qwel_id, fren_id from likes where qwel_id = ?', q.id).map { |l| Like.new l }
      
    {likeHtml: erb(:like_info, {layout: false, locals: {qwel: q}})}.to_json
  else
    if back.include? 'random'
      redirect to("/random?i=#{params[:qwel_id]}#q#{params[:qwel_id]}")
    else
      redirect to("#{back}#q#{params[:qwel_id]}")
    end
  end
end

get '/looks/new' do
  erb :look
end

get '/poasts' do
  @poasts = get_poasts
  @poasts.each { |p| p.replies = get_poasts(p.id) }
  erb :poasts
end

get '/poasts/new' do
end

post '/poasts' do
  if current_fren && current_fren.id == params[:fren_id].to_i
    if params[:body].strip.length > 0
      db.execute 'insert into poasts (title, body, fren_id, created_at) values (?, ?, ?, ?)', [params[:title].strip, params[:body].strip, params[:fren_id], Time.now.utc.to_s]

      redirect to("/poasts")
    else
    end
  else
    401
  end
end

get '/poasts/:poast_id' do
end

get '/poasts/:post_id/new' do
end

post '/poasts/:poast_id/poasts' do
  unless params[:body] &&
         params[:body].strip.length > 0 &&
         params[:poast_id].to_i > 0  &&
         params[:fren_id] &&
         current_fren &&
         current_fren.id == params[:fren_id].to_i
    halt 400
  end
  
  db.execute 'insert into poasts (body, fren_id, poast_id, created_at) values (?, ?, ?, ?)', [params[:body], params[:fren_id], params[:poast_id], Time.now.utc.to_s]

  if xhr?
    p = get_poasts(nil, db.last_insert_row_id).first

    {id: p.id, poastHtml: erb(:poastReply, {layout: false, locals: {parent_id: params[:poast_id].to_i, poast: p}})}.to_json
  else
    redirect to('/poasts')
  end
end

get '/words' do
  Bazaar.object
end

__END__

@@ layout
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="/tones.css" rel="stylesheet" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <script src="/audio.js"></script>
    <script src="/unmute.min.js"></script>
    <title>quick loops</title>
  </head>
  <body>
    <div id="actions">
      <div class="innerActions">
        <div style="flex: 0;" class="col left">
          <a style="font-size: 1em;" href="/">quickloops</a>
        </div>
        <div style="flex: 1;" class="col right">
          <% if current_fren %>
            <a class="spaceRight" style="font-size: 1.0em;" href="/qwels/new">new</a>
          <% end %>
          <a class="spaceRight" href="/poasts">poasts</a>
          <a class="spaceRight" href="/random">random</a>
          <% if current_fren %>
            <a class="spaceRight" href="/frens/<%= current_fren.id %>">me</a>
          <% else %>
            <a href="/frens/new">log in</a>
          <% end %>
        </div>
      </div>
    </div>
    <div id="main">
      <%= yield %>
    </div>
  </body>
</html>

@@ poasts
<% if current_fren %>
  <div class="newPoast poast">
    <div><b>make a new poast of power</b></div>
    <form action="/poasts" method="post">
      <div class="smolTopAndBottomMargin">
        <input class="fullWidth" type="text" name="title" placeholder="title of new poast" />
      </div>
      <div class="smolTopAndBottomMargin">
        <textarea id="area0" name="body" placeholder="type a new poast"></textarea>
      </div>
      <input type="hidden" name="fren_id" value=<%= current_fren.id %> />
      <input disabled type="submit" id="submit0" />
    </form>
  </div>
<% end %>
<% if @poasts.empty? %>
  <div class="poast">
    nothing to see here!
  </div>
<% end %>
<% @poasts.each do |p| %>
  <div class="poast">
    <div class="body">
      <% if p.title %>
        <div class="title">
          <%= p.title %>
        </div>
      <% end %>
      <div class="text" id="text<%= p.id %>">
        <% p.parsed.each do |bp| %><% if bp.first == :q %><div class="quote"><%= bp.last %></div><% else %><span><%= bp.last %></span><% end %>
        <% end %>
      </div>
      <div class="commentInfo">
        <%= p.fren.name %>
        <% if p.fren.look %>
          <%= erb :minilook, locals: {width: '16px', look: p.fren.look, fren_id: p.fren.id} %>
        <% end %> - <%= chron p.created_at %><% if current_fren %> - <a class="doQuote" href="#" id="quote<%= p.id %>-<%= p.id %>">quote</a><% end %>
      </div>
    </div>
    <div class="replies" id="replies<%= p.id %>">
      <% p.replies.each do |r| %>
        <%= erb :poastReply, locals: {parent_id: p.id, poast: r} %>
      <% end %>
    </div>
    <% if current_fren %>
      <div class="reply">
        <div class="newPoast">
          <form action="/poasts/<%= p.id %>/poasts" method="post" class="poastReplyForm" id="poastReplyForm<%= p.id %>">
            <div>
              <textarea id="area<%= p.id %>" name="body" placeholder="type a new poast"></textarea>
            </div>
            <input type="hidden" name="fren_id" value=<%= current_fren.id %> />
            <input disabled type="submit" id="submit<%= p.id %>" />
          </form>
        </div>
      </div>
    <% end %>
  </div>
<% end %>
<%= erb :minilookhelp %>
<script type="text/javascript">
  const quoteClick = (e) => {
    e.preventDefault()

    let idStrParts = e.target.id.slice(5).split('-')
    let poastId = parseInt(idStrParts[0])
    let replyId = parseInt(idStrParts[1])
    let text = [...document.querySelector(`#text${replyId}`).children].map(c => {
      if (c.className === 'quote')
        return `[${c.innerText}]` 
      else
        return c.innerText
    }).join(' ')
    let area = document.querySelector(`#poastReplyForm${poastId} textarea`)
    area.value = area.value + "'''" + text + "'''\n"
  }

  const postReply = (e) => {
    e.preventDefault()

    let form = e.target
    let input = form.querySelector(':scope textarea')
    let poastId = parseInt(form.id.slice(14))

    if (input.value.length === 0)
      return false

    let url = form.action
    let method = form.method
    let frenId = form.querySelector(':scope input[name="fren_id"]').value
    let body = input.value
    let btn = form.querySelector(':scope input[type="submit"]')
    let xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.onreadystatechange = function() {
      if (this.readyState != 4) return
      if (this.status == 200) {
        input.value = ''
        input.blur()
        btn.disabled = true
        let data = JSON.parse(this.responseText)
        document.querySelector(`#replies${poastId}`).insertAdjacentHTML('beforeend', data.poastHtml)
        document.querySelector(`#quote${poastId}-${data.id}`).onclick = quoteClick
        let ml = document.querySelector(`#reply${data.id} .minilookContainer`)
        layoutMinilooks(ml)
      } else {
        console.error("BAD: ", this.status, this.responseText)
      }
    }

    let bag = {
      fren_id: frenId,
      body: body
    }

    xhr.send(JSON.stringify(bag));
  }

  forEach(document.querySelectorAll('.poastReplyForm'), (index, form) => {
    form.onsubmit = postReply
  })

  forEach(document.querySelectorAll('.doQuote'), (index, q) => {
    q.onclick = quoteClick
  })

  forEach(document.querySelectorAll('textarea'), (index, input) => {
    let id = parseInt(input.id.slice(4))
    let btn = document.querySelector(`#submit${id}`)
    input.onkeyup = (e) => {
      btn.disabled = input.value.length === 0
    }
  })
</script>

@@ poastReply
<div class="reply" id="reply<%= poast.id %>">
  <div class="replyBody" id="text<%= poast.id %>">
    <% poast.parsed.each do |bp| %><% if bp.first == :q %><div class="quote"><%= bp.last %></div><% else %><span><%= bp.last %></span><% end %>
    <% end %>
  </div>
  <div class="replyInfo">
    <%= poast.fren.name %>
    <% if poast.fren.look %>
      <%= erb :minilook, locals: {width: '16px', look: poast.fren.look, fren_id: poast.fren.id} %>
    <% end %> - <%= chron poast.created_at %><% if current_fren %> - <a class="doQuote" href="#" id="quote<%= parent_id %>-<%= poast.id %>">quote</a><% end %>
  </div>
</div>

@@ just_look
<div class="lookView">
  <%= erb :look, locals: {
    look: look,
    editable: editable,
    editNow: editNow,
    form_action: form_action,
    form_method: form_method
  } %>
</div>

@@ look
<% form_action = "/looks" unless form_action %>
<% form_method = "post" unless form_method %>
<% editable = false unless editable %>
<% look = "" unless look %>
<% editNow = false unless editNow %>
<% if editable %>
  <div style="text-align: right; padding-bottom: 0.5em;">
    <a href="#" id="editNow" class="startEditing<%= " hidden" if editNow %>">edit</a>
  </div>
  <div id="lookTools" class="lookTools<%= " hidden" unless editNow %>">
    <% if look == '' || look.nil? %>
      <p>Create an icon for your profile by painting in the 16x16 grid below. Or, <a href="/">skip this.</a> You can do it later from your profile page.</p>
    <% end %>
    <select onchange="showColor(this)" id="palette">
      <% %w(red orange yellow green blue indigo violet gray black white).each do |c| %>
        <option value="<%= c %>"><%= c %></option>
      <% end %>
    </select>
    <div id="colorCell">
      <div class="lookCellHeight"></div>
    </div>
    <span>
      <label for="fill">fill</label>
      <input type="checkbox" id="fill" />
    </span>
  </div>
<% end %>
<div class="look noselect">
  <% (16 * 16).times do |i| %><div class="noselect lookCell <%= editable && editNow && (i.to_f / 16).floor.even? ? i.even? ? 'gray4' : 'gray5' : (i.even? ? 'gray5' : 'gray4') if editable && editNow %>"><div class="lookCellHeight noselect"></div></div><% end %>
</div>
<% if editable %>
  <form id="lookForm" class="lookForm<%= " hidden" unless editNow %>" action="<%= form_action %>" method="<%= form_method %>">
    <input type="hidden" name="look" />
    <input type="submit" value="save" />
  </form>
<% end %>
<script type="text/javascript">
  let editable = <%= editable %>
  let editNow = <%= editNow %>
  let colors = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'white', 'black', 'gray']
  let color = 'red'
  let painting = false
  let mouseDown = false
  let rep = "<%= look %>"

  const encode = () => {
    rep = ""

    forEach(document.querySelectorAll('.lookCell'), (i, cell) => {
      let classNames = [...cell.classList.entries()].map(e => e[1])
      let foundColor = classNames.find(c => colors.includes(c))

      if (!!foundColor) {
        rep = rep.concat(
          i.toString(16).toUpperCase().padStart(2, '0'),
          colors.indexOf(foundColor).toString(16).toUpperCase().padStart(2, '0')
        )
      }
    })

    // history.replaceState(null, null, `?l=${rep}`)
    document.querySelector("form.lookForm input[name='look']").value = rep
  }

  const init = () => {
    if (rep === null || rep === undefined || rep.length === 0) {
      const params = (new URL(document.location)).searchParams
      const repParam = params.get('l')

      if (repParam != null && repParam != undefined) {
        rep = repParam
        parseRep()
      }
    } else {
      parseRep()
    }

    if (editable) {
      if (editNow) {
        hookup()
      } else {
        document.querySelector('#editNow').onclick = (e) => {
          e.preventDefault()
          e.target.classList.add('hidden')
          document.querySelector('#lookTools').classList.remove('hidden')
          document.querySelector('#lookForm').classList.remove('hidden')
          document.querySelector('.look').classList.add('pointy')
          forEach(document.querySelectorAll('.lookCell'), (i, cell) => {
            if (Math.floor(i / 16) % 2 === 0) {
              if (i % 2 === 0) {
                cell.classList.add('gray4')
              } else {
                cell.classList.add('gray5')
              }
            } else {
              if (i % 2 === 0) {
                cell.classList.add('gray5')
              } else {
                cell.classList.add('gray4')
              }
            }
          })
          hookup()
        }
      }
    }
  }

  const parseRep = () => {
    let cells = [...document.querySelectorAll('.lookCell')]

    rep.match(/.{1,4}/g) // get groups of 4
       .forEach(cellRep => {
         let positionIndex = parseInt(cellRep.slice(0, 2), 16)
         let colorIndex = parseInt(cellRep.slice(2, 4), 16)

         cells[positionIndex].classList.remove(...colors)
         cells[positionIndex].classList.add(colors[colorIndex])
       })
  }

  const showColor = (e) => {
    document.querySelector('#colorCell').classList.remove(...colors)
    document.querySelector('#colorCell').classList.add(e.value)
    color = e.value
  }

  const startDrag = (e) => {
    e.preventDefault()

    mouseDown = true

    if (e.target.classList.contains(color)) {
      e.target.classList.remove(...colors)
      painting = false
    } else {
      painting = true
      e.target.classList.remove(...colors)
      e.target.classList.add(color)
    }
  }

  const maybePaint = (e) => {
    e.preventDefault()

    if (mouseDown) {
      if (painting) {
        e.target.classList.remove(...colors)
        e.target.classList.add(color)
      } else {
        e.target.classList.remove(...colors)
      }
    }
  }

  const hookup = () => {
    forEach(document.querySelectorAll('.lookCell'), (i, cell) => {
      cell.onmousedown = startDrag
      cell.onmousemove = maybePaint

      cell.ontouchstart = (e) => {
        e.preventDefault()

        mouseDown = true

        if (e.target.classList.contains(color)) {
          e.target.classList.remove(...colors)
          painting = false
        } else {
          painting = true
          e.target.classList.remove(...colors)
          e.target.classList.add(color)
        }
      }

      cell.ontouchmove = (e) => {
        e.preventDefault()

        let touch = e.touches[0]
        let elem = document.elementFromPoint(touch.clientX, touch.clientY)

        if (mouseDown && elem.classList.contains('lookCell')) {
          if (painting) {
            elem.classList.remove(...colors)
            elem.classList.add(color)
          } else {
            elem.classList.remove(...colors)
          }
        }
      }
    })

    document.onmouseup = (e) => {
      mouseDown = false
      encode()
    }

    document.ontouchend = (e) => {
      mouseDown = false
      encode()
    }

    showColor({ value: color })
  }

  init()
</script>

@@ qwels
<% if title %>
  <div class="frenName"><%= title %></div>
<% end %>
<div class="sortHolder">
  <label>sort by</label>
  <select id="sortSelect" onchange="setSort(this)">
    <option selected value=0>freshest</option>
    <option value=1>newest</option>
    <option value=2>most liked</option>
    <option value=3>longest</option>
    <option value=4>shortest</option>
  </select>
</div>
<div class="paging">
  <% if page && page > 1 %>
    <a href="#" onclick="replaceOrAddSearchParam('page', 1); return false;">first</a>
  <% end %>
  <% if page && page > 1 %>
    <a href="#" onclick="replaceOrAddSearchParam('page', <%= page - 1 %>); return false;">prev</a>
  <% end %>
  <% if page && page_count %>
    <span>page <%= page %> of <%= page_count %></span>
  <% end %> <% if page && page_count && page < page_count %>
    <a href="#" onclick="replaceOrAddSearchParam('page', <%= page + 1 %>); return false;">next</a>
  <% end %>
  <% if page && page < page_count %>
    <a href="#" onclick="replaceOrAddSearchParam('page', <%= page_count %>); return false;">last</a>
  <% end %>
</div>
<div>
  <% if @qwels.empty? %>
    <div class="qwel">nothing to show!</div>
  <% end %>
  <% @qwels.each do |qwel| %>
    <%= erb :mini, locals: {qwel: qwel} %>
  <% end %>
</div>
<%= erb :minilookhelp %>
<%= erb :minihelp %>
<div class="paging bottom">
  <% if page && page > 1 %>
    <a href="#" onclick="replaceOrAddSearchParam('page', 1); return false;">first</a>
  <% end %>
  <% if page && page > 1 %>
    <a href="#" onclick="replaceOrAddSearchParam('page', <%= page - 1 %>); return false;">prev</a>
  <% end %>
  <% if page && page_count %>
    <span>page <%= page %> of <%= page_count %></span>
  <% end %>
  <% if page && page_count && page < page_count %>
    <a href="#" onclick="replaceOrAddSearchParam('page', <%= page + 1 %>); return false;">next</a>
  <% end %>
  <% if page && page < page_count %>
    <a href="#" onclick="replaceOrAddSearchParam('page', <%= page_count %>); return false;">last</a>
  <% end %>
</div>

<script type="text/javascript">
  const params = (new URL(document.location)).searchParams
  const sortParam = params.get('sort')

  if (sortParam !== null && sortParam !== undefined) {
    document.querySelector('#sortSelect').value = sortParam
  }

  const setSort = (element) => {
    replaceOrAddSearchParam('sort', element.value)
  }

  const replaceOrAddSearchParam = (key, value) => {
    let replaced = false
    let newSearchStr = window.location.search.slice(1).split('&').map(kvStr => {
      let pair = kvStr.split('=')
      
      if (pair[0] === key) {
        replaced = true
        return `${key}=${value}`
      } else {
        return kvStr
      }
    }).join('&')

    if (!replaced) {
      let maybeAmp = newSearchStr.length > 0 ? '&' : ''
      newSearchStr = newSearchStr.concat(`${maybeAmp}${key}=${value}`)
    }

    history.replaceState(null, null, ' ');
    window.location.search = newSearchStr
  }
</script>

@@ fren
<div class="frenName"><%= @visit_fren.name %></div>
<% if @visit_fren.look || (current_fren && @visit_fren.id == current_fren.id) %>
  <div class="lookView">
    <%= erb :look, locals: {
        look: @visit_fren.look,
        editable: current_fren && current_fren.id == @visit_fren.id,
        form_action: "/frens/#{@visit_fren.id}/look",
        form_method: "post"
      }
    %>
  </div>
<% end %>
<ul>
  <li><a href="/frens/<%= @visit_fren.id %>/qwels"><%= @visit_fren.name %>'s qwels</a></li>
  <li><a href="/frens/<%= @visit_fren.id %>/likes">qwels <%= @visit_fren.name %> likes</a></li>
  <% if current_fren && current_fren.id == @visit_fren.id %>
    <li><a href="/logout">log out</a></li>
  <% end %>
</ul>

@@ random
<div>
  <% if @qwel %>
    <%= erb :mini, locals: {qwel: @qwel} %>
  <% else %>
    <div class="qwel">
      nothing exists yet!
    </div>
  <% end %>
</div>
<%= erb :minilookhelp %>
<%= erb :minihelp %>

@@ new_fren
<div class="qwel options">
  <div class="options">
    <div class="option active" id="optionSignIn">
      <div class="text">
        sign in
      </div>
    </div>
    <div class="option" id="optionSignUp">
      <div class="text">
        sign up
      </div>
    </div>
  </div>
  <div class="content">
    <span class="error"><%= error_for params[:e] %></span>
    <div class="contentPane" id="contentSignIn">
      <form autocomplete="off" action="/login" method="post" autocomplete="off">
        <input class="fullWidth" type="text" name="name" placeholder="name" value="<%= params[:name] %>" /> 
        <br />
        <input class="fullWidth" type="password" name="password" placeholder="password" /> 
        <br />
        <input type="submit" value="submit" />
      </form>
    </div>
    <div style="display: none;" class="contentPane" id="contentSignUp">
      <form action="/frens" method="post" autocomplete="off">
        <input class="fullWidth" type="text" name="name" placeholder='name (letters, numbers, "-", "_")' value="<%= params[:name] %>" /> 
        <br />
        <input class="fullWidth" type="password" name="password" placeholder="password" /> 
        <br />
        <input class="fullWidth" type="password" name="password_confirmation" placeholder="confirm password" /> 
        <br />
        <input type="submit" value="submit" />
      </form>
    </div>
  </div>
</div>
<script type="text/javascript">
  forEach(document.querySelectorAll('.option'), (i, o) => {
    o.onclick = (e) => {
      let name = e.currentTarget.id.slice(6)

      forEach(document.querySelectorAll('.option'), (i, p) => {
        p.classList.remove('active')
      })

      forEach(document.querySelectorAll('.contentPane'), (i, c) => {
        c.style.display = "none"
      })

      document.querySelector(`#content${name}`).style.display = "block"
      document.querySelector('.error').innerText = ''
      e.currentTarget.classList.add('active')
    }
  })

  const params = (new URL(document.location)).searchParams
  const paneParam = params.get('p')
  if (paneParam) {
    forEach(document.querySelectorAll('.option'), (i, p) => {
      p.classList.remove('active')
    })

    forEach(document.querySelectorAll('.contentPane'), (i, c) => {
      c.style.display = "none"
    })

    document.querySelector(`#content${paneParam}`).style.display = "block"
    document.querySelector(`#option${paneParam}`).classList.add('active')
  }
</script>

@@ minilook
<% width = '1em' unless width %>
<a class="noStyle" href="/frens/<%= fren_id %>/look">
  <div style="display: inline-block;" class="minilookContainer">
    <input type="hidden" value="<%= look %>" />
    <div class="minilook" style="width: <%= width %>">
      <% (16 * 16).times do |i| %><div class="lookCell"><div class="lookCellHeight"></div></div><% end %>
    </div>
  </div>
</a>

@@ minilookhelp
<script type="text/javascript">
  let colors = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'white', 'black', 'gray']

  const layoutMinilooks = (container) => {
    if (container) {
      let rep = container.querySelector(':scope input[type="hidden"]').value
      let cells = [...container.querySelectorAll(':scope .minilook .lookCell')]

      rep.match(/.{1,4}/g) // get groups of 4
         .forEach(cellRep => {
           let positionIndex = parseInt(cellRep.slice(0, 2), 16)
           let colorIndex = parseInt(cellRep.slice(2, 4), 16)

           cells[positionIndex].classList.remove(...colors)
           cells[positionIndex].classList.add(colors[colorIndex])
         })
    } else {
      forEach(document.querySelectorAll('.minilookContainer'), (i, container) => {
        let rep = container.querySelector(':scope input[type="hidden"]').value
        let cells = [...container.querySelectorAll(':scope .minilook .lookCell')]

        rep.match(/.{1,4}/g) // get groups of 4
           .forEach(cellRep => {
             let positionIndex = parseInt(cellRep.slice(0, 2), 16)
             let colorIndex = parseInt(cellRep.slice(2, 4), 16)

             cells[positionIndex].classList.remove(...colors)
             cells[positionIndex].classList.add(colors[colorIndex])
           })
      })
    }
  }

  layoutMinilooks()
</script>

@@ like_info
<%= "#{qwel.likes.count} #{qwel.likes.count == 1 ? 'like' : 'likes'}" %>
<% if current_fren %>
  <form class="likeForm" id="likeForm<%= qwel.id %>" autocomplete="off" style="display: inline;"  method="post" action="/qwels/<%= qwel.id %>/<%= current_fren && qwel.liked_by?(current_fren) ? "delete_likes" : "likes" %><%= "?#{request.query_string}" unless request.query_string.empty? %>">
    <input name="fren_id" type="hidden" value=<%= current_fren.id if current_fren %> />
    <input type="submit" value=<%= current_fren && qwel.liked_by?(current_fren) ? "unlike" : "like" %> />
  </form>
<% end %>

@@ mini
<div class="qwel" id="qwel<%= qwel.id %>">
  <a class="qwelAnchor" id="q<%= qwel.id %>"></a>
  <input type="hidden" class="qwelRep" id="qwelRep<%= qwel.id %>" value="<%= qwel.rep %>" />
  <div onclick="togglePlay(<%= qwel.id %>)" class="qwelGrid" id="qwelGrid<%= qwel.id %>">
    <div class="playHint" id="playHint<%= qwel.id %>">tap to play</div>
  </div>
  <div class="secondLine">
    <a href="/qwels/<%= qwel.id %>"><%= qwel.name %></a>
    -
    <%= "#{qwel.length / 60000}:" + "#{(qwel.length / 1000) % 60}".rjust(2, '0') %>
    -
    <a href="/frens/<%= qwel.fren.id %>"><%= qwel.fren.name %></a>
    <% if qwel.fren.look %>
      <%= erb :minilook, locals: {width: '16px', look: qwel.fren.look, fren_id: qwel.fren.id} %>
    <% end %>
    -
    <%= chron qwel.updated_at %>
    -
    <span id="likes<%= qwel.id %>">
      <%= erb :like_info, locals: {qwel: qwel} %>
    </span>
    <% if current_fren && qwel.fren_id != current_fren.id && !qwel.remixed_by?(current_fren)  %>
      <form method="POST" action="/qwels/<%= qwel.id %>/remix">
        <input type="submit" value="remix" />
      </form>
    <% end %>
  </div>
  <% if qwel.remixed_from %>
    <div class="secondLine">
      remixed from <a href="/qwels/<%= qwel.remixed_from.id %>"><%= qwel.remixed_from.name %></a> by <a href="/frens/<%= qwel.remixed_from.fren.id %>"><%= qwel.remixed_from.fren.name %></a>
      <% if qwel.remixed_from.fren.look %>
        <%= erb :minilook, locals: {width: '16px', look: qwel.remixed_from.fren.look, fren_id: qwel.remixed_from.fren.id} %>
      <% end %>
    </div>
  <% end %>
  <div class="comms">
    <a class="qwelAnchor2" id="m<%= qwel.id %>"></a>
    <% if current_fren %>
      <div class="commentFormHolder">
        <form class="commentForm" id="commentForm<%= qwel.id %>" autocomplete="off" method="post" action="/qwels/<%= qwel.id %>/comments<%= "?#{request.query_string}" unless request.query_string.empty? %>">
          <input name="fren_id" type="hidden" value=<%= current_fren.id %> />
          <input style="margin-top: 1em;" name="body" class="commentInput" type="text" form="commentForm<%= qwel.id %>" id="commentInput<%= qwel.id %>" placeholder="add a comment" />
          <input class="commentButton" id="submitComment<%= qwel.id %>" type="submit" disabled value="post comment">
        </form>
      </div>
    <% end %>
    <ul id="comments<%= qwel.id %>">
      <% qwel.comments.each do |c| %>
        <%= erb :comment, locals: {comment: c} %>
      <% end %>
    </ul>
  </div>
</div>

@@ comment
<li class="comment">
  <div class="commentBody"><%= comment.body %></div>
  <div class="commentInfo">
    <%= comment.fren.name %>
    <% if comment.fren.look %>
      <%= erb :minilook, locals: {width: '16px', look: comment.fren.look, fren_id: comment.fren.id} %>
    <% end %> - <%= chron comment.created_at %>
  </div>
</li>


@@ minihelp
<div class="t noselect proto"><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div><div class="d noselect"><div class="b noselect"><div class="c noselect"></div></div></div></div>
<script type="text/javascript">
  let proto = document.querySelector('.proto')
  let buffers = {}
  let columns = {}
  let reps = {}
  let loaded
  let loadedId

  const postComment = (e) => {
    e.preventDefault()

    let form = e.target
    let qwelId = parseInt(form.id.slice(11))
    let input = document.querySelector(`#commentInput${qwelId}`)

    if (input.value.length === 0)
      return false

    let url = form.action
    let method = form.method
    let frenId = form.querySelector(':scope input[name="fren_id"]').value
    let body = form.querySelector(':scope input[name="body"]').value
    let btn = form.querySelector(':scope input[type="submit"]')
    let xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.onreadystatechange = function() {
      if (this.readyState != 4) return
      if (this.status == 200) {
        input.value = ''
        input.blur()
        btn.disabled = true
        let data = JSON.parse(this.responseText)
        document.querySelector(`#comments${qwelId}`).insertAdjacentHTML('afterbegin', data.commentHtml)
        let ml = document.querySelector(`#comments${qwelId}`).firstChild.querySelector('.minilookContainer')
        layoutMinilooks(ml)
      } else {
        console.error("BAD: ", this.status, this.responseText)
      }
    }

    let bag = {
      fren_id: frenId,
      body: body
    }

    xhr.send(JSON.stringify(bag));
  }

  const likeOrUnlike = (e) => {
    e.preventDefault()

    let form = e.target
    let url = form.action
    let method = form.method
    let frenId = form.querySelector(':scope input[name="fren_id"]').value
    let qwelId = parseInt(form.id.slice(8))
    let xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.onreadystatechange = function() {
      if (this.readyState != 4) return
      if (this.status == 200) {
        let data = JSON.parse(this.responseText)
        document.querySelector(`#likes${qwelId}`).innerHTML = data.likeHtml
        document.querySelector(`#likeForm${qwelId}`).onsubmit = likeOrUnlike
      } else {
        console.error("BAD: ", this.status, this.responseText)
      }
    }

    let bag = {
      fren_id: frenId
    }

    xhr.send(JSON.stringify(bag));
  }

  forEach(document.querySelectorAll('.likeForm'), (index, form) => {
    form.onsubmit = likeOrUnlike
  })

  forEach(document.querySelectorAll('.commentForm'), (index, form) => {
    form.onsubmit = postComment
  })

  forEach(document.querySelectorAll('.qwelRep'), (index, input) => {
    let rep = input.value
    let id = parseInt(input.id.slice(7))

    reps[id] = parse(rep)
    
    let container = document.querySelector(`#qwelGrid${id}`)
    let totalGridCount = reps[id].phrases.reduce((acc, curr) => {
      return acc + curr.grids.length
    }, 0)

    let idealSquare = 1

    while (idealSquare ** 2 < totalGridCount) {
      idealSquare++
    }

    let gridWidth, gridHeight

    reps[id].phrases.forEach((phrase, i) => {
      phrase.grids.forEach((gridData, j) => {
        let a = proto.cloneNode(true)

        a.classList.remove('proto')
        a.style.width = `${1 / idealSquare * 100}%`
        a.id = `grid${id}-${i}-${j}`

        let cells = a.querySelectorAll('.d')

        forEach(cells, (i, cell) => {
          let b = cell.firstElementChild
          let rowNo = Math.floor(i / 16)
          let cellNo = i % 16

          if (gridData.pattern[cellNo] === rowNo) {
            b.classList.remove("red", "green", "blue", "orange", "purple")
            b.classList.add(toneClass(gridData.tone || 0))
          } else {
            b.classList.remove("red", "green", "blue", "orange", "purple")
            
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
          }
        })

        container.appendChild(a)
      })
    })

    columns[id] = gatherColumns(reps[id], id)
  })

  forEach(document.querySelectorAll('.commentInput'), (index, input) => {
    input.onkeyup = (e) => {
      let id = parseInt(e.target.id.slice(12))
      document.querySelector(`#submitComment${id}`).disabled = e.target.value.length === 0
    }
  })
</script>
