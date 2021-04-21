require 'bazaar'
require 'bcrypt'
require 'sinatra'
require 'sqlite3'
require 'sysrandom'
require 'time'

include BCrypt

use Rack::Session::Cookie, :key => 'rack.session',
                           :path => '/',
                           :secret => ENV.fetch('SESSION_SECRET') { SecureRandom.hex(64) }

use Rack::Protection, permitted_origins: ['http://localhost:4567', 'https://quickloops.net', 'https://www.quickloops.net']
use Rack::Protection::AuthenticityToken
use Rack::Protection::RemoteToken

class String; def humanize; self.capitalize; end; end

helpers do
  def error_for code
    code.nil? ? '' : [
      'Provide both a name and password.',
      'Bad passsword.',
      'No such user.',
      'Provide a name, password, and password confirmation.',
      'Trying to trick me?',
      "Password and confirmation don't match.",
      'That name is taken.',
      'Only alphanumerics, dashes ("-"), or underscores ("_") for name please.',
      'Please limit name to 32 characters or less',
      'Why submit emptiness? :('
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
      db = SQLite3::Database.new "ql7.db"

      db.execute_batch <<-SQL
        create table if not exists looks (
          id integer primary key,
          rep text
        );

        create table if not exists users (
          id integer primary key,
          name text unique,
          password_hash text,
          look text,
          last_login date
        );

        create table if not exists posts (
          id integer primary key,
          title text,
          body text,
          look text,
          user_id integer,
          post_id integer,
          created_at date,
          foreign key(user_id) references users(id),
          foreign key(post_id) references posts(id)
        );

        create table if not exists remixes (
          id integer primary key,
          snapshot text,
          tune_id integer,
          user_id integer,
          created_at date,
          foreign key(tune_id) references tunes(id),
          foreign key(user_id) references users(id)
        );

        create table if not exists tunes (
          id integer primary key,
          name text,
          rep text,
          length integer,
          look text,
          created_at date,
          updated_at date,
          user_id integer,
          remix_id integer,
          foreign key(user_id) references users(id),
          foreign key(remix_id) references remixes(id)
        );

        create table if not exists comments (
          id integer primary key,
          body text,
          look text,
          created_at date,
          tune_id integer,
          user_id integer,
          foreign key(tune_id) references tunes(id),
          foreign key(user_id) references users(id)
        );

        create table if not exists likes (
          id integer primary key,
          look text,
          user_id integer,
          tune_id integer,
          foreign key(user_id) references users(id),
          foreign key(tune_id) references tunes(id)
        );
      SQL

      db
    end
  end

  def get_remix_id tune_id, user_id
    q = db.execute('select tunes.id from tunes inner join remixes on tunes.remix_id = remixes.id where remixes.tune_id = ? and remixes.user_id = ? limit 1', [tune_id, user_id]).first

    q.first if q
  end

  def current_user 
    if session[:user_id]
      @user ||= User.new db.execute("select id, name, look, last_login from users where id = ?", session[:user_id]).first
    end
  end

  def page
    @page ||= params[:page] ? params[:page].to_i : 1
  end

  def page_size
    @page_size ||= 2
  end

  def page_count
    @page_count ||= [(db.execute("select count(id) from tunes").first.first.to_f / page_size).ceil, 1].max
  end

  def post_page_count
    @post_page_count ||= [(db.execute("select count(id) from posts where post_id is null").first.first.to_f / page_size).ceil, 1].max
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

  def get_tune id
    q = db.execute("select id, name, rep, length, look, user_id, created_at, updated_at, remix_id from tunes where id = ? limit 1", id).first

    if q
      t = Tune.new(q) 

      t.remixes = db.execute('select id, tune_id, user_id, snapshot from remixes where tune_id = ?', t.id).map { |f| Remix.new f }

      if t.remix_id
        qfres = db.execute('select tunes.id, tunes.name, users.id, users.name, users.look from tunes inner join users on tunes.user_id = users.id inner join remixes on tunes.id = remixes.tune_id where remixes.id = ? limit 1', t.remix_id).first

        qf = Tune.new qfres[0..1]
        qf.user = User.new qfres[2..4]

        t.remixed_from = qf
      end

      t
    end
  end

  def get_user id
    f = db.execute('select id, name, look, last_login, password_hash from users where id = ? limit 1', id).first

    User.new(f) if f
  end

  def get_user_by_name name
    f = db.execute('select id, name, look, last_login, password_hash from users where name = ? limit 1', name).first

    User.new(f) if f
  end

  def get_posts parent_id = nil, id = nil
    query = if parent_id
              "select * from posts where post_id = ? order by created_at asc limit #{page_size * (page - 1)}, #{page_size}"
            elsif id
              'select * from posts where id = ? limit 1'
            else
              "select * from posts where post_id is null order by created_at desc limit #{page_size * (page - 1)}, #{page_size}"
            end

    db.execute(query, parent_id || id).map do |p|
      n = Post.new p
      n.user = get_user(n.user_id) if n.user_id
      n
    end
  end
end

before do
  if xhr?
    request.body.rewind
    body = request.body.read
    params.merge!(JSON.parse(body).transform_keys(&:to_sym)) if body.length > 0
  end
end

class User
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

  def to_h
    {
      id: id,
      name: name,
      look: look,
      last_login: last_login
    }
  end
end

class Comment
  attr_reader :id, :body, :look, :user_id, :tune_id, :created_at
  attr_accessor :user, :tune

  def initialize ary = nil
    @id = ary[0]
    @body = ary[1]
    @look = ary[2]
    @user_id = ary[3]
    @tune_id = ary[4]
    @created_at = Time.parse(ary[5]) if ary[5]
  end

  def to_h
    {
      id: id,
      body: body,
      look: look,
      user: (user.to_h if user),
      user_id: user_id,
      tune_id: tune_id,
      created_at: created_at.to_s
    }
  end
end

class Post
  attr_reader :id, :title, :body, :look, :user_id, :post_id, :created_at
  attr_accessor :user, :post, :replies

  def initialize ary = nil
    @id = ary[0]
    @title = ary[1]
    @body = ary[2]
    @look = ary[3]
    @user_id = ary[4]
    @post_id = ary[5]
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
    elsif parts.length > 0
      [[:l, parts.first.strip]]
    else
      []
    end
  end
end

class Remix 
  attr_reader :id, :tune_id, :user_id, :snapshot, :created_at
  attr_accessor :tune, :user

  def initialize ary = nil
    if ary.respond_to?(:each)
      @id = ary[0]
      @tune_id = ary[1]
      @user_id = ary[2]
      @snapshot = ary[3]
      @created_at = ary[4]
    end
  end

  def to_h
    {
      id: id,
      user: (user.to_h if user),
      user_id: user_id,
      tune_id: tune_id,
      created_at: created_at.to_s
    }
  end
end

class Tune
  attr_reader :id, :name, :rep, :length, :look, :tags, :likes, :user_id, :remix_id, :created_at, :updated_at
  attr_accessor :user, :likes, :length, :comments, :remixes, :remixed_from

  def initialize ary = nil
    if ary.respond_to?(:each)
      @id = ary[0]
      @name = ary[1]
      @rep = ary[2]
      @length = ary[3]
      @look = ary[4]
      @user_id = ary[5]
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

  def to_h
    {
      id: id,
      name: name,
      rep: rep,
      length: length,
      look: look,
      user: (user.to_h if user),
      likes: likes.map(&:to_h),
      comments: comments.map(&:to_h),
      remixes: remixes.map(&:to_h)
    }
  end

  def liked_by? user_id_or_user
    f = user_id_or_user.is_a?(User) ? user_id_or_user.id : user_id_or_user

    !!@likes.find { |l| l.user_id && l.user_id == f }
  end

  def remixed_by? user_id_or_user
    f = user_id_or_user.is_a?(User) ? user_id_or_user.id : user_id_or_user

    !!@remixes.find { |r| r.user_id && r.user_id == f }
  end

  def remix_by user_id_or_user
    f = user_id_or_user.is_a?(User) ? user_id_or_user.id : user_id_or_user

    @remixes.find { |r| r.user_id && r.user_id == f }
  end
end

class Like
  attr_reader :id, :look, :tune_id, :user_id

  def initialize ary
    @id = ary[0]
    @look = ary[1]
    @tune_id = ary[2]
    @user_id = ary[3]
  end

  def to_h
    {
      id: id,
      look: look,
      user_id: user_id,
      tune_id: tune_id
    }
  end
end

def discern_title user = nil
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

  t = "#{user.name}'s #{t}" if user
  t
end

def random_id no = nil
  s = db.execute("select count(id) from tunes").first.first

  return if s.zero?

  r = Random.new.rand(1..s)

  while r == no do r = Random.new.rand(1..s) end

  r
end

def get_comments tune_id = nil, comment_id = nil
  w = if tune_id
        ' where comments.tune_id = ? '
      elsif comment_id
        ' where comments.id = ? '
      else
        ' '
      end

  cres = db.execute "select comments.id, body, comments.look, user_id, tune_id, created_at, users.id, name, users.look from comments inner join users on users.id = comments.user_id#{w}order by created_at desc", tune_id || comment_id

  cres.map do |c|
    com = Comment.new c[0..5]
    com.user = User.new c[6..8]
    com
  end
end

def tunes_with_users_and_like_counts user_id = nil, id = nil, like_user_id = nil
  s = case sort
      when 0
        'tunes.updated_at desc'
      when 1
        'tunes.created_at desc'
      when 2
        'like_count desc'
      when 3
        'tunes.length desc'
      when 4
        'tunes.length asc'
      else
        'tunes.updated_at desc'
      end

  f = if like_user_id
        " where likes.user_id = #{like_user_id} "
      elsif id
        " where tunes.id = #{id} "
      elsif user_id
        " where tunes.user_id = #{user_id} "
      else
        ' '
      end

  q = "select tunes.id, tunes.name, rep, length, tunes.look, tunes.user_id, created_at, updated_at, remix_id, count(likes.tune_id) as like_count, users.id, users.name, users.look from tunes inner join users on tunes.user_id = users.id left join likes on tunes.id = likes.tune_id#{f}group by tunes.id order by #{s} limit #{page_size * (page - 1)}, #{page_size}"

  db.execute(q).map do |row|
    q = Tune.new row[0..9]
    q.user = User.new row[10..12]
    q.comments = get_comments q.id

    q.likes = db.execute('select id, look, tune_id, user_id from likes where tune_id = ?', q.id).map { |l| Like.new l }

    q.remixes = db.execute('select id, tune_id, user_id, snapshot from remixes where tune_id = ?', q.id).map { |f| Remix.new f }

    if q.remix_id
      qfres = db.execute('select tunes.id, tunes.name, users.id, users.name, users.look from tunes inner join users on tunes.user_id = users.id inner join remixes on tunes.id = remixes.tune_id where remixes.id = ? limit 1', q.remix_id).first

      qf = Tune.new qfres[0..1]
      qf.user = User.new qfres[2..4]

      q.remixed_from = qf
    end

    q
  end
end

get '/random' do
  id = params[:i] ? params[:i].to_i : random_id(params[:r].to_i)
  
  @tune = tunes_with_users_and_like_counts(nil, id).first

  if xhr?
    @tune.to_h.to_json

    {tuneHtml: erb(:mini, {layout: false, locals: {tune: @tune}})}.to_json
  else
    erb :random
  end
end

get '/' do
  @tunes = tunes_with_users_and_like_counts

  erb :tunes
end

get '/users/:user_id/tunes' do
  @page_count = [
    db.execute("select count(id) from tunes where user_id = ?", params[:user_id]).first.first / page_size,
    1
  ].max

  @visit_user = User.new db.execute('select id, name, look from users where id = ?', params[:user_id]).first
  @tunes = tunes_with_users_and_like_counts @visit_user.id
  @title = "#{@visit_user.name}'s tunes"

  erb :tunes
end

get '/users/:user_id/likes' do
  @page_count = [
    db.execute("select count(id) from likes where user_id = ?", params[:user_id]).first.first / page_size,
    1
  ].max

  @visit_user = User.new db.execute('select id, name, look from users where id = ?', params[:user_id]).first
  @tunes = tunes_with_users_and_like_counts nil, nil, params[:user_id]
  @title = "tunes #{@visit_user.name} likes"

  erb :tunes
end

get '/users/new' do
  erb :new_user
end

get '/users/:user_id' do
  @visit_user = User.new db.execute('select id, name, look from users where id = ?', params[:user_id]).first
  erb :user
end

get '/users/:user_id/look' do
  look = db.execute('select look from users where id = ?', params[:user_id]).first.first
  erb :just_look, locals: {
    look: look,
    editable: current_user && current_user.id == params[:user_id].to_i,
    editNow: look.nil?,
    form_action: "/users/#{params[:user_id]}/look",
    form_method: "post"
  }
end

post '/users/:user_id/look' do
  if current_user && current_user.id == params[:user_id].to_i
    db.execute 'update users set look = ? where id = ?', [params[:look], params[:user_id]]
  end

  if params[:r] && params[:r] == 'h'
    redirect to '/'
  else
    redirect to back
  end
end

post '/login' do
  if !params[:name] || !params[:password] || params[:name].length.zero? || params[:password].length.zero?
    redirect to("/users/new?name=#{params[:name]}&e=0")
  end

  f = get_user_by_name params[:name]

  if f && f.name
    if Password.new(f.password_hash) == params[:password]
      db.execute 'update users set last_login = ? where id = ?', [Time.now.utc.to_s, f.id]
      session[:user_id] = f.id
      
      if f.look.nil?
        redirect to("/users/#{f.id}/look?r=h")
      else
        redirect to('/')
      end
    else
      redirect to("/users/new?name=#{f.name}&e=1")
    end
  else
    redirect to("/users/new?e=2")
  end
end

post '/users' do
  if !params[:name] || !params[:password] || !params[:password_confirmation] ||
    params[:name].length.zero? || params[:password].length.zero? || params[:password_confirmation].length.zero?
    redirect to("/users/new?name=#{params[:name]}&p=SignUp&e=3")
  elsif !params[:name].match(/^[a-zA-Z0-9\-_]+$/)
    redirect to("/users/new?p=SignUp&e=7")
  elsif params[:name].length > 32
    redirect to("/users/new?name=#{params[:name]}&p=SignUp&e=8")
  elsif params[:password_confirmation] != params[:password]
    redirect to("/users/new?name=#{params[:name]}&p=SignUp&e=5")
  else
    f = get_user_by_name params[:name]

    if f
      redirect to("/users/new?name=#{params[:name]}&p=SignUp&e=6")
    end
  end

  db.execute 'insert into users (name, password_hash, last_login) values (?, ?, ?)',
    [params[:name], Password.create(params[:password]), Time.now.utc.to_s]
  session[:user_id] = db.last_insert_row_id
  redirect to("/users/#{db.last_insert_row_id}/look?r=h")
end

get '/error' do
end

get '/tunes' do
end

get '/tunes/new' do
  @tune = Tune.new

  erb :tune, layout: :tune_layout
end

get '/tunes/:tune_id' do
  @tune = tunes_with_users_and_like_counts(nil, params[:tune_id]).first

  halt(404) unless @tune

  @remix_id = get_remix_id(@tune.id, current_user.id) if current_user

  erb :tune, layout: :tune_layout
end

post '/tunes' do
  unless params[:name].strip.length > 0 && params[:rep].strip.length > 0 &&
         params[:length].is_a?(Numeric) && current_user && current_user.id == params[:user_id].to_i
    halt 500
  end

  t = Time.now.utc.to_s

  db.execute 'insert into tunes (name, rep, length, user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)', params.values_at(:name, :rep, :length, :user_id) + [t, t]

  { id: db.last_insert_row_id }.to_json
end

put '/tunes/:tune_id' do
  res = db.execute("select user_id from tunes where id = #{params[:tune_id]} limit 1").first

  halt(404) if res.nil?
  halt(401) if res[0] != current_user.id 

  db.execute "update tunes set name = ?, rep = ?, length = ?, updated_at = ? where id = #{params[:tune_id]}", params.values_at(:name, :rep, :length) + [Time.now.utc.to_s]

  { id: params[:tune_id] }.to_json
end

post '/tunes/:tune_id/remix' do
  q = get_tune params[:tune_id]

  t = Time.now.utc.to_s

  db.execute 'insert into remixes (snapshot, tune_id, user_id, created_at) values (?, ?, ?, ?)', [q.rep, q.id, current_user.id, t]

  t = Time.now.utc.to_s
  name = "#{current_user.name}'s #{q.name} remix"

  rep = params[:rep] ? params[:rep] : q.rep
  rep = rep.split '|'
  rep[0] = ERB::Util.url_encode name
  rep = rep.join '|'

  db.execute 'insert into tunes (name, rep, length, user_id, remix_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)', [name, rep, q.length, current_user.id, db.last_insert_row_id, t, t]

  redirect to("/tunes/#{db.last_insert_row_id}")
end

get '/logout' do
  session[:user_id] = nil
  redirect to('/')
end

post '/tunes/:tune_id/comments' do
  unless params[:body] &&
         params[:user_id] &&
         params[:tune_id] &&
         current_user &&
         current_user.id == params[:user_id].to_i
    halt 400
  end
  
  db.execute 'insert into comments (body, look, user_id, tune_id, created_at) values (?, ?, ?, ?, ?)', [params[:body], params[:look], params[:user_id], params[:tune_id], Time.now.utc.to_s]

  if xhr?
    c = get_comments(nil, db.last_insert_row_id).first

    {commentHtml: erb(:comment, {layout: false, locals: {comment: c}})}.to_json
  else
    if back.include? 'random'
      redirect to("/random?i=#{params[:tune_id]}#m#{params[:tune_id]}")
    else
      redirect to("#{back}#m#{params[:tune_id]}")
    end
  end
end

post '/tunes/:tune_id/likes' do
  unless params[:user_id] &&
         params[:tune_id] &&
         current_user &&
         current_user.id == params[:user_id].to_i
    halt 400
  end
  
  db.execute 'insert into likes (user_id, tune_id) values (?, ?)', [params[:user_id], params[:tune_id]]

  if xhr?
    q = get_tune params[:tune_id]
    q.likes = db.execute('select id, look, tune_id, user_id from likes where tune_id = ?', q.id).map { |l| Like.new l }
      
    {likeHtml: erb(:like_info, {layout: false, locals: {tune: q}})}.to_json
  else
    if back.include? 'random'
      redirect to("/random?i=#{params[:tune_id]}#q#{params[:tune_id]}")
    else
      redirect to("#{back}#q#{params[:tune_id]}")
    end
  end
end

post '/tunes/:tune_id/delete_likes' do
  unless params[:user_id] &&
         params[:tune_id] &&
         current_user &&
         current_user.id == params[:user_id].to_i
    halt 400
  end

  db.execute 'delete from likes where user_id = ? and tune_id = ?', [params[:user_id], params[:tune_id]]

  if xhr?
    q = get_tune params[:tune_id]
    q.likes = db.execute('select id, look, tune_id, user_id from likes where tune_id = ?', q.id).map { |l| Like.new l }
      
    {likeHtml: erb(:like_info, {layout: false, locals: {tune: q}})}.to_json
  else
    if back.include? 'random'
      redirect to("/random?i=#{params[:tune_id]}#q#{params[:tune_id]}")
    else
      redirect to("#{back}#q#{params[:tune_id]}")
    end
  end
end

get '/looks/new' do
  erb :look
end

get '/posts' do
  @posts = get_posts
  @posts.each { |p| p.replies = get_posts(p.id) }
  erb :posts
end

get '/posts/new' do
end

post '/posts' do
  if current_user && current_user.id == params[:user_id].to_i
    if params[:body].strip.length > 0 || params[:look].strip.length > 0
      db.execute 'insert into posts (title, body, look, user_id, created_at) values (?, ?, ?, ?, ?)', [params[:title].strip, params[:body].strip, params[:look].strip, params[:user_id], Time.now.utc.to_s]

      redirect to("/posts")
    else
      redirect to("/posts?e=9")
    end
  else
    401
  end
end

get '/posts/:post_id' do
end

get '/posts/:post_id/new' do
end

post '/posts/:post_id/posts' do
  unless (
           (params[:body] && params[:body].strip.length > 0) ||
           (params[:look] && params[:look].strip.length > 0)
         ) &&
         params[:post_id].to_i > 0 &&
         params[:user_id] &&
         current_user &&
         current_user.id == params[:user_id].to_i
    halt 400
  end
  
  db.execute 'insert into posts (body, look, user_id, post_id, created_at) values (?, ?, ?, ?, ?)', [params[:body].strip, params[:look].strip,  params[:user_id], params[:post_id], Time.now.utc.to_s]

  if xhr?
    p = get_posts(nil, db.last_insert_row_id).first

    {id: p.id, postHtml: erb(:post_reply, {layout: false, locals: {parent_id: params[:post_id].to_i, post: p}})}.to_json
  else
    redirect to('/posts')
  end
end

get '/words' do
  Bazaar.object
end

