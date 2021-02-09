require 'sinatra'
require 'sqlite3'
require 'bcrypt'
require 'time'

include BCrypt

enable :sessions

helpers do
  def chron time
    t = ((Time.now.utc - time).to_i / 86400).floor

    puts Time.now.utc, 'hi'
    puts time, 'lo'

    case t
    when 0
      'today'
    when 1
      'yesterday'
    else
      "#{t} days ago"
    end
  end

  def db
    @db ||= begin
      db = SQLite3::Database.new "ql.db"

      qwels_table = db.execute 'select * from sqlite_schema where type = "table" and name = "qwels"'

      if qwels_table.empty?
        db.execute_batch <<-SQL
          create table looks (
            id integer primary key,
            rep text,
            next_look_id integer,
            foreign key(next_look_id) references looks(look_id)
          );

          create table frens (
            id integer primary key,
            name text unique,
            password_hash text,
            last_login date,
            look_id integer,
            foreign key(look_id) references looks(id)
          );

          create table forks {
            id integer primary key,
            snapshot text,
            qwel_id integer,
            fren_id integer,
            created_at date,
            foreign_key(qwel_id) references qwels(id)
            foreign_key(fren_id) references frens(id)
          }

          create table qwels (
            id integer primary key,
            name text,
            rep text unique,
            look text,
            length integer,
            tags string,
            created_at date,
            updated_at date,
            fren_id integer,
            look_id integer,
            link_id integer,
            fork_id integer,
            foreign key(fren_id) references frens(id),
            foreign key(look_id) references looks(id)
            foreign key(link_id) references qwels(id)
            foreign key(fork_id) references forks(id)
          );

          create table comments (
            id integer primary key,
            body text,
            created_at date,
            qwel_id integer,
            fren_id integer,
            foreign key(qwel_id) references qwels(id)
            foreign key(fren_id) references frens(id)
          );

          create table likes (
            id integer primary key,
            fren_id integer,
            qwel_id integer,
            foreign key(fren_id) references frens(id),
            foreign key(qwel_id) references qwels(id)
          );
        SQL
      end

      db
    end
  end

  def fren 
    if session[:fren_id]
      @fren ||= Fren.new db.execute("select id, name, last_login from frens where id = ?", session[:fren_id]).first
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
    @title || 'latest tracks'
  end
end

class Fren
  attr_reader :id, :name, :password_hash

  def initialize ary = nil
    if ary.respond_to?(:each)
      @id = ary[0]
      @name = ary[1]
      @password_hash = ary[2]
    end
  end
end

class Comment
  attr_reader :id, :body, :fren_id, :qwel_id, :created_at
  attr_accessor :fren, :qwel

  def initialize ary = nil
    @id = ary[0]
    @body = ary[1]
    @fren_id = ary[2]
    @qwel_id = ary[3]
    @created_at = ary[4]
  end
end

class Qwel
  attr_reader :id, :name, :rep, :length, :tags, :likes, :fren_id, :created_at, :updated_at
  attr_accessor :fren, :likes, :length, :comments

  def initialize ary = nil
    if ary.respond_to?(:each)
      @id = ary[0]
      @name = ary[1]
      @rep = ary[2]
      @length = ary[3]
      @fren_id = ary[4]
      @created_at = ary[5]
      @updated_at = ary[6]
    else
      @rep = ""
    end

    @likes = []
    @comments = []
  end

  def liked_by? fren_id_or_fren
    f = fren_id_or_fren.is_a?(Fren) ? fren_id_or_fren.id : fren_id_or_fren

    @likes.find do |l|
      l.fren_id && l.fren_id == f
    end
  end
end

class Like
  attr_reader :id, :qwel_id, :fren_id

  def initialize ary
    @id = ary[0]
    @qwel_id = ary[1]
    @fren_id = ary[2]
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
  r = Random.new.rand(1..s)

  while r == no do r = Random.new.rand(1..s) end

  r
end

def qwels_with_frens_and_like_counts fren_id = nil, id = nil
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

  f = if id
        " where qwels.id = #{id} "
      elsif fren_id
        " where qwels.fren_id = #{fren_id} "
      else
        ' '
      end

  q = "select qwels.id, qwels.name, rep, length, qwels.fren_id, created_at, updated_at, count(likes.qwel_id) as like_count, frens.id, frens.name from qwels inner join frens on qwels.fren_id = frens.id left join likes on qwels.id = likes.qwel_id#{f}group by qwels.id order by #{s} limit #{page_size * (page - 1)}, #{page_size}"

  puts q

  db.execute(q).map do |row|
    q = Qwel.new row[0..7]
    q.fren = Fren.new row[8..9]

    cres = db.execute 'select comments.id, body, fren_id, qwel_id, created_at, frens.id, name from comments inner join frens on frens.id = comments.fren_id where comments.qwel_id = ? order by created_at desc', q.id

    q.comments = cres.map do |c|
      com = Comment.new c[0..4]
      com.qwel = q
      com.fren = Fren.new c[5..6]
      com
    end

    q.likes = db.execute('select id, qwel_id, fren_id from likes where qwel_id = ?', q.id).map { |l| Like.new l }

    q
  end
end

get '/random' do
  @qwel = qwels_with_frens_and_like_counts(nil, random_id(params[:r].to_i)).first

  erb :random
end

get '/' do
  @qwels = qwels_with_frens_and_like_counts
  @title = discern_title

  erb :qwels
end

get '/frens/:fren_id/qwels' do
  @page_count = [
    db.execute("select count(id) from qwels where fren_id = ?", params[:fren_id]).first.first / page_size,
    1
  ].max

  @visit_fren = Fren.new db.execute('select id, name from frens where id = ?', params[:fren_id]).first
  @qwels = qwels_with_frens_and_like_counts @visit_fren.id
  @title = discern_title @visit_fren

  erb :qwels
end

get '/frens/new' do
  erb :new_fren
end

get '/frens/:fren_id' do
  @visit_fren = Fren.new db.execute('select id, name from frens where id = ?', params[:fren_id]).first
  erb :fren
end

post '/frens' do
  begin
    res = db.execute('select id, name, password_hash from frens where name = ? limit 1', params[:name]).first
    fren = Fren.new res

    if fren.name
      if Password.new(fren.password_hash) == params[:password]
        session[:fren_id] = fren.id
        redirect to('/')
      else
        redirect to("/frens/new?e=Incorrect password.")
      end
    else
      db.execute 'insert into frens (name, password_hash, last_login) values (?, ?, ?)',
                 [params[:name], Password.create(params[:password]), Time.now.utc.to_s]
      res = db.execute('select id, name, password_hash from frens where name = ? limit 1', params[:name]).first
      fren = Fren.new res
      session[:fren_id] = fren.id
      redirect to('/')
    end
  rescue SQLite3::ConstraintException => e
    a = <<-ERR
      <h1>Error, baby</h1>
      <p><%= msg %></p>
      <a href="/frens/new">back.</a>
    ERR

    erb a, locals: { msg: e.message }
  end
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
  qres = db.execute("select id, name, rep, length, fren_id from qwels where id = ? limit 1", params[:qwel_id])

  if qres.empty?
    'no qwel for this'
  else
    @qwel = Qwel.new qres.first

    erb :qwel, layout: :qwel_layout
  end
end

post '/qwels' do
  request.body.rewind

  attrs = JSON.parse(request.body.read).transform_keys(&:to_sym)

  unless attrs[:name].to_s.length > 0 && attrs[:rep].to_s.length > 0 &&
         attrs[:length].is_a?(Numeric) && attrs[:fren_id].is_a?(Numeric)
    halt 500
  end

  t = Time.now.utc.to_s

  db.execute 'insert into qwels (name, rep, length, fren_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)', attrs.values_at(:name, :rep, :length, :fren_id) + [t, t]

  res = db.execute 'select id from qwels where name = ? and rep = ? and length = ? and fren_id = ? limit 1',
        attrs.values_at(:name, :rep, :length, :fren_id)
 
  { id: res.first[0] }.to_json
end

put '/qwels/:qwel_id' do
  request.body.rewind

  attrs = JSON.parse(request.body.read).transform_keys(&:to_sym)
  res = db.execute("select fren_id from qwels where id = #{params[:qwel_id]} limit 1").first

  halt(404) if res.nil?
  halt(409) if res[0] != session[:fren_id]

  db.execute "update qwels set name = ?, rep = ?, length = ?, updated_at = ? where id = #{params[:qwel_id]}", attrs.values_at(:name, :rep, :length) + [Time.now.utc.to_s]

  { id: params[:qwel_id] }.to_json
end

post '/qwels/:qwel_id/fork' do
  db.execute 'insert into forks (snapshot, qwel_id) values (?, ?, ?)', [Time.now.utc.to_s]
  l = 'select from forks where ????'
  redirect to("/qwels/new?l=#{}")
end

get '/logout' do
  session[:fren_id] = nil
  redirect to('/')
end

post '/qwels/:qwel_id/comments' do
  if params[:fren_id]
    db.execute 'insert into comments (body, fren_id, qwel_id, created_at) values (?, ?, ?, ?)', [params[:body], params[:fren_id], params[:qwel_id], Time.now.utc.to_s]
  end

  redirect to("#{back}#m#{params[:qwel_id]}")
end

post '/qwels/:qwel_id/likes' do
  db.execute 'insert into likes (fren_id, qwel_id) values (?, ?)', [params[:fren_id], params[:qwel_id]]

  redirect to("#{back}#q#{params[:qwel_id]}")
end

post '/qwels/:qwel_id/delete_likes' do
  db.execute 'delete from likes where fren_id = ? and qwel_id = ?', [params[:fren_id], params[:qwel_id]]

  redirect to("#{back}#q#{params[:qwel_id]}")
end

__END__

@@ layout
<html>
  <head>
    <link href="/tones.css" rel="stylesheet" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <script src="/audio.js"></script>
    <script src="/unmute.min.js"></script>
  </head>
  <body>
    <div id="actions">
      <div class="innerActions">
        <div style="flex: 0;" class="col left">
          <a href="/"><h1>ql</h1></a>
        </div>
        <div style="flex: 1;" class="col right">
          <% if fren %>
            <a class="spaceRight" href="/qwels/new">new</a>
          <% end %>
          <a class="spaceRight" href="/random">random</a>
          <% if fren %>
            <a href="/logout">log out</a>
          <% else %>
            <a href="/frens/new">log in</a>
          <% end %>
        </div>
      </div>
    </div>
    <div class="actions">
    </div>
    <div id="main">
      <%= yield %>
    </div>
  </body>
</html>

@@ fren_qwels
<a href='/frens/<%= @fren.id %>/qwels/new'>new qwel</a>
<ol>
  <% @qwels.each do |qwel| %>
    <li>
      <a href="/qwels/<%= qwel.id %>">
        <%= qwel.name %>
      </a>
    </li>
  <% end %>
</ol>

@@ qwels
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
<div style="margin-top: 20px;" class="paging">
  <% if page && page > 1 %>
    <a href="#" onclick="replaceOrAddSearchParam('page', 1); return false;">first</a>
  <% end %>
  <% if page && page > 1 %>
    <a style="margin: 0 10px 0 0;" href="#" onclick="replaceOrAddSearchParam('page', <%= page - 1 %>); return false;">previous</a>
  <% end %>
  <% if page && page_count %>
    <span>page <%= page %> of <%= page_count %></span>
  <% end %>
  <% if page && page_count && page < page_count %>
    <a style="margin: 0 0 0 10px;" href="#" onclick="replaceOrAddSearchParam('page', <%= page + 1 %>); return false;">next</a>
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
    <%= erb :mini, locals: { qwel: qwel } %>
  <% end %>
</div>
<%= erb :minihelp %>
<div class="paging">
  <% if page && page > 1 %>
    <a href="#" onclick="replaceOrAddSearchParam('page', 1); return false;">first</a>
  <% end %>
  <% if page && page > 1 %>
    <a style="margin: 0 10px 0 0;" href="#" onclick="replaceOrAddSearchParam('page', <%= page - 1 %>); return false;">previous</a>
  <% end %>
  <% if page && page_count %>
    <span>page <%= page %> of <%= page_count %></span>
  <% end %>
  <% if page && page_count && page < page_count %>
    <a style="margin: 0 0 0 10px;"href="#" onclick="replaceOrAddSearchParam('page', <%= page + 1 %>); return false;">next</a>
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

    window.location.search = newSearchStr
  }
</script>

@@ fren
<h2><%= @visit_fren.name %></h2>
<ul>
  <li><a href="/frens/<%= @visit_fren.id %>/qwels"><%= @visit_fren.name %>'s qwels</a></li>
</ul>

@@ random
<div>
  <%= erb :mini, locals: { qwel: @qwel } %>
</div>
<%= erb :minihelp %>

@@ new_fren
<form autocomplete="off" action="/frens" method="post" autocomplete="off">
  <input type="text" name="name" placeholder="name" /> 
  <br />
  <input type="password" name="password" placeholder="password" /> 
  <br />
  <input type="submit" value="submit" />
</form>

@@ mini
<div class="qwel" id="qwel<%= qwel.id %>">
  <a class="qwelAnchor" id="q<%= qwel.id %>"></a>
  <div>
    <a href="/qwels/<%= qwel.id %>"><%= qwel.name %></a>
  </div>
  <div style="font-size: 0.6em; margin-top: 0.5em;">
    <a href="/frens/<%= qwel.fren.id %>"><%= qwel.fren.name %></a>
    <div style="background-color: red; display: inline-block; width: 1em;">
      <div style="padding-top: 100%;"></div>
    </div>
    -
    <%= chron Time.parse(qwel.updated_at) %>
    -
    <%= qwel.likes.count %>
    <%= qwel.likes.count == 1 ? 'like' : 'likes' %>
    <% if fren %>
      <form autocomplete="off" style="display: inline;"  method="post" action="/qwels/<%= qwel.id %>/<%= fren && qwel.liked_by?(fren.id) ? "delete_likes" : "likes" %><%= "?#{request.query_string}" unless request.query_string.empty? %>">
        <input name="fren_id" type="hidden" value=<%= fren.id if fren %> />
        <input type="submit" value=<%= fren && qwel.liked_by?(fren.id) ? "unlike" : "like" %> />
      </form>
    <% end %>
    <% if fren %>
      <form method="POST" action="/qwels/<%= qwel.id %>/fork">
        <input type="submit" value="fork" />
      </form>
    <% end %>
  </div>
  <input type="hidden" class="qwelRep" id="qwelRep<%= qwel.id %>" value="<%= qwel.rep %>" />
  <div onclick="togglePlay(<%= qwel.id %>)" class="qwelGrid" id="qwelGrid<%= qwel.id %>">
    <div class="playHint" id="playHint<%= qwel.id %>">tap to play</div>
  </div>
  <div class="comms">
    <a class="qwelAnchor" id="m<%= qwel.id %>"></a>
    <% if fren %>
      <form class="commentForm" id="commentForm<%= qwel.id %>" autocomplete="off" method="post" action="/qwels/<%= qwel.id %>/comments<%= "?#{request.query_string}" unless request.query_string.empty? %>">
        <input name="fren_id" type="hidden" value=<%= fren.id %> />
        <input name="body" class="commentInput" type="text" form="commentForm<%= qwel.id %>" id="commentInput<%= qwel.id %>" placeholder="add a comment" />
        <input style="margin-top: 20px;" class="commentButton" id="submitComment<%= qwel.id %>" type="submit" disabled value="post comment">
      </form>
    <% end %>
    <ul id="qwel<%= qwel.id %>Comments">
      <% qwel.comments.each do |c| %>
        <li class="comment">
          <div class="commentBody"><%= c.body %></div>
          <div class="commentInfo"><i><%= c.fren.name %> - <%= chron Time.parse(c.created_at) %></i></div>
        </li>
      <% end %>
    </ul>
  </div>
</div>

@@ minihelp
<div class="t proto"><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div><div class="d"><div class="b"><div class="c"></div></div></div></div>
<script type="text/javascript">
  let proto = document.querySelector('.proto')
  let buffers = {}
  let columns = {}
  let reps = {}
  let loaded
  let loadedId

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

  forEach(document.querySelectorAll('.commentForm'), (index, form) => {
    form.onsubmit = (e) => {
      let id = parseInt(e.target.id.slice(11))
      let input = document.querySelector(`#commentInput${id}`)

      if (input.value.length === 0) {
        e.preventDefault()
        return false
      }
    }
  })

  forEach(document.querySelectorAll('.commentInput'), (index, input) => {
    input.onkeyup = (e) => {
      let id = parseInt(e.target.id.slice(12))
      document.querySelector(`#submitComment${id}`).disabled = e.target.value.length === 0
    }
  })
</script>
