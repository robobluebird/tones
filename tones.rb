require 'sinatra'
require 'sqlite3'
require 'bcrypt'
require 'time'

include BCrypt

enable :sessions

helpers do
  def db
    @db ||= begin
      db = SQLite3::Database.new "ql.db"

      qwels_table = db.execute 'select 1 from sqlite_schema where type = "table" and name = "qwels"'

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
            foreign key(fren_id) references frens(id),
            foreign key(look_id) references looks(id)
            foreign key(link_id) references qwels(id)
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

  def liked? fren_id_or_fren
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

def qwels_with_frens_and_like_counts fren_id = nil
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

  f = fren_id ? " where qwels.fren_id = #{fren_id} " : ' '

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

get '/' do
  @qwels = qwels_with_frens_and_like_counts

  erb :frens
end

get '/frens/:fren_id/qwels' do
  @page_count = [
    db.execute("select count(id) from qwels where fren_id = ?", params[:fren_id]).first.first / page_size,
    1
  ].max

  @visit_fren = Fren.new db.execute('select id, name from frens where id = ?', params[:fren_id]).first
  @qwels = qwels_with_frens_and_like_counts @visit_fren.id

  erb :frens
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
      db.execute 'insert into frens (name, password_hash, last_login) values (?, ?, datetime("now"))',
                 [params[:name], Password.create(params[:password])]
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

  db.execute 'insert into qwels (name, rep, length, fren_id, created_at, updated_at) values (?, ?, ?, ?, datetime("now"), datetime("now"))', attrs.values_at(:name, :rep, :length, :fren_id)

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

  db.execute "update qwels set name = ?, rep = ?, length = ?, updated_at = datetime('now') where id = #{params[:qwel_id]}", attrs.values_at(:name, :rep, :length)

  { id: params[:qwel_id] }.to_json
end

get '/logout' do
  session[:fren_id] = nil
  redirect to('/')
end

post '/qwels/:qwel_id/comments' do
  if params[:fren_id]
    db.execute 'insert into comments (body, fren_id, qwel_id, created_at) values (?, ?, ?, datetime("now"))', [params[:body], params[:fren_id], params[:qwel_id]]
  end

  redirect to("/?#{request.query_string}#miniplay#{params[:qwel_id]}")
end

post '/qwels/:qwel_id/likes' do
  db.execute 'insert into likes (fren_id, qwel_id) values (?, ?)', [params[:fren_id], params[:qwel_id]]
  redirect to("/?#{request.query_string}#qwel#{params[:qwel_id]}")
end

post '/qwels/:qwel_id/delete_likes' do
  db.execute 'delete from likes where fren_id = ? and qwel_id = ?', [params[:fren_id], params[:qwel_id]]
  redirect to("/?#{request.query_string}#qwel#{params[:qwel_id]}")
end

__END__

@@ layout
<html>
  <head>
    <link href="/tones.css" rel="stylesheet" />
    <script src="/audio.js"></script>
  </head>
  <body>
    <div id="actions">
      <div class="col left">
        <% if fren %>
          <span class="spaceRight">
            welcome, <a href="/frens/<%= fren.id %>"><%= fren.name %></a>
          </span>
          <span class="spaceRight">
            <a href="/qwels/new">new qwel</a>
          </span>
          <% if request.path != '/' %>
            <span class="spaceRight">
              <a href="/">home</a>
            </span>
          <% end %>
          <span>
            <a href="/logout">log out</a>
          </span>
        <% else %>
          <% if request.path != '/frens/new' %>
            <span class="spaceRight">
              <a href="/frens/new">log in</a>
            </span>
          <% end %>
          <% if request.path != '/' %>
            <span>
              <a href="/">home</a>
            </span>
          <% end %>
        <% end %>
        <span style="margin-left: 20px;" style="color: red;"><%= params[:e] %></span>
      </div>
      <div class="col center"></div>
      <div class="col right">
        <a href="/"><h1>quick loops</h1></a>
      </div>
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

@@ frens
<div>
  <h2><%= title || "latest tracks" %></h2>
  <label>sort by</label>
  <select id="sortSelect" onchange="setSort(this)">
    <option selected value=0>most recently updated</option>
    <option value=1>most recently created</option>
    <option value=2>most liked</option>
    <option value=3>longest length</option>
    <option value=4>shortest length</option>
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
  <% @qwels.each do |qwel| %>
    <div class="qwel" id="qwel<%= qwel.id %>">
      <div class="info">
        <a class="qwelAnchor" id="qwel<%= qwel.id %>"></a>
        <div>
          <table class="qwelInfo">
            <thead>
              <tr>
                <th>name</th>
                <th>created by</th>
                <th>length</th>
                <th>last update</th>
                <th>likes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <a href="/qwels/<%= qwel.id %>"><%= qwel.name %></a>
                  <% if fren %>
                    <% if fren.id == qwel.fren_id %>
                      <a class="noStyle" href="/qwels/<%= qwel.id %>">
                        <button class="pb">edit</button>
                      </a>
                    <% end %>
                    <a class="noStyle" href="/qwels/new?l=<%= qwel.id %>&p=<%= qwel.rep.split('|')[1..-1].unshift('').join('|') %>">
                      <button class="pb">copy</button>
                    </a> 
                  <% end %>
                </td>
                <td><a href="/frens/<%= qwel.fren.id %>"><%= qwel.fren.name %></a></td>
                <td><%= "#{qwel.length / 60000}:" + "#{(qwel.length / 1000) % 60}".rjust(2, '0') %></td>
                <td><%= Time.parse(qwel.updated_at).strftime('%l:%M%P %-m/%e/%Y') %></td>
                <td>
                  <%= qwel.likes.count %>
                  <% if fren %>
                    <form autocomplete="off" style="display: inline;"  method="post" action="/qwels/<%= qwel.id %>/<%= fren && qwel.liked?(fren.id) ? "delete_likes" : "likes" %><%= "?#{request.query_string}" unless request.query_string.empty? %>">
                      <input name="fren_id" type="hidden" value=<%= fren.id if fren %> />
                      <input type="submit" value=<%= fren && qwel.liked?(fren.id) ? "unlike" : "like" %> />
                    </form>
                  <% end %>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <input type="hidden" class="qwelRep" id="qwelRep<%= qwel.id %>" value="<%= qwel.rep %>" />
      <div class="qwelGrid" id="qwelGrid<%= qwel.id %>">
      </div>
      <div class="playAndComms">
        <div>
          <button onclick="togglePlay(<%= qwel.id %>)" class="miniplay" id="miniplay<%= qwel.id %>">play</button>
        </div>
        <% if fren %>
          <form class="commentForm" id="commentForm<%= qwel.id %>" autocomplete="off" method="post" action="/qwels/<%= qwel.id %>/comments<%= "?#{request.query_string}" unless request.query_string.empty? %>">
            <input name="fren_id" type="hidden" value=<%= fren.id %> />
            <input name="body" class="commentInput" type="text" id="commentInput<%= qwel.id %>" placeholder="add a comment" />
            <input class="commentButton" id="submitComment<%= qwel.id %>" type="submit" disabled value="post comment">
          </form>
        <% end %>
        <ul id="qwel<%= qwel.id %>Comments">
          <% qwel.comments.each do |c| %>
            <li class="comment">
              <div><i><%= c.fren.name %> - <%= Time.parse(c.created_at).strftime('%l:%M%P %-m/%e/%Y') %></i></div>
              <div class="commentBody"><%= c.body %></div>
            </li>
          <% end %>
        </ul>
      </div>
    </div>
  <% end %>
</div>
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

<table class="minigrid proto">
  <tbody>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  </tbody>
</table>

<script type="text/javascript">
  const params = (new URL(document.location)).searchParams
  const sortParam = params.get('sort')

  if (sortParam !== null && sortParam !== undefined) {
    document.querySelector('#sortSelect').value = sortParam
  }

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
    
    // buffers[id] = generateSound(parsed)

    let container = document.querySelector(`#qwelGrid${id}`)

    reps[id].phrases.forEach((phrase, i) => {
      phrase.grids.forEach((gridData, j) => {
        let grid = proto.cloneNode(true)

        grid.classList.remove('proto')
        grid.id = `grid${id}-${i}-${j}`

        const trs = grid.querySelectorAll(':scope tr')

        forEach(trs, (k, tr) => {
          const tds = tr.querySelectorAll(':scope td')

          forEach(tds, (l, td) => {
            if (gridData.pattern[l] === k) {
              td.classList.remove("red", "green", "blue", "orange", "purple")
              td.classList.add(toneClass(gridData.tone || 0))
            } else {
              td.classList.remove("red", "green", "blue", "orange", "purple")
            }
          })
        })

        container.appendChild(grid)
      })
    })

    columns[id] = gatherColumns(reps[id], id)
  })

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

@@ fren
<h2><%= @visit_fren.name %></h2>
<ul>
  <li><a href="/frens/<%= @visit_fren.id %>/qwels"><%= @visit_fren.name %>'s qwels</a></li>
</ul>

@@ new_fren
<form autocomplete="off" action="/frens" method="post" autocomplete="off">
  <input type="text" name="name" placeholder="name" /> 
  <input type="password" name="password" placeholder="password" /> 
  <input type="submit" value="submit" />
</form>
