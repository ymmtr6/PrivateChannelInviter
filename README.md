# PrivateChannelInviter

情報の公開範囲を学科に限定する近大WSの運用上、プライベートチャンネルが基本となっている。しかし紹介なしでは気軽にチャンネルに参加できない問題がある。そこで、チャンネル招待を自動化するAPPを構成する。

### ユースケース

* 参加可能なプライベートチャンネルには、あらかじめこのAPPを追加しておく
* このAPPはコマンド、ショートカットからの入力を受け付ける
* このAPPが入力を受け付けると、ユーザの情報から招待可否を判断、希望するチャンネルへ招待する
* アプリが不要になった場合、チャンネルから退室する
* HomeTabに参加可能なチャンネル名と、そのトピック／説明を一覧表示する

### 実行方法
ローカルで実行する場合

```
$ cp _env .env
# tokenなどsecret情報を編集
$ npm i
$ npm run local
```

Dockerで実行する場合

```
docker build -t my-bolt-app .
docker run --env-file .env -it my-bolt-app
```
