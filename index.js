// `cp _env .env` then modify it
// See https://github.com/motdotla/dotenv
const config = require("dotenv").config().parsed;
// Overwrite env variables anyways
for (const k in config) {
  process.env[k] = config[k];
}

const { LogLevel } = require("@slack/logger");
const logLevel = process.env.SLACK_LOG_LEVEL || LogLevel.DEBUG;

const { App, ExpressReceiver } = require("@slack/bolt");
// If you deploy this app to FaaS, turning this on is highly recommended
// Refer to https://github.com/slackapi/bolt/issues/395 for details
const processBeforeResponse = false;
// Manually instantiate to add external routes afterwards
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse,
});
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  logLevel,
  receiver,
  processBeforeResponse,
});

// Request dumper middleware for easier debugging
if (process.env.SLACK_REQUEST_LOG_ENABLED === "1") {
  app.use(async (args) => {
    const copiedArgs = JSON.parse(JSON.stringify(args));
    copiedArgs.context.botToken = 'xoxb-***';
    if (copiedArgs.context.userToken) {
      copiedArgs.context.userToken = 'xoxp-***';
    }
    copiedArgs.client = {};
    copiedArgs.logger = {};
    args.logger.debug(
      "Dumping request data for debugging...\n\n" +
      JSON.stringify(copiedArgs, null, 2) +
      "\n"
    );
    const result = await args.next();
    args.logger.debug("next() call completed");
    return result;
  });
}

// ---------------------------------------------------------------
// Start coding here..
// see https://slack.dev/bolt/

// https://api.slack.com/apps/{APP_ID}/event-subscriptions
app.event("app_mention", async ({ logger, client, event, say }) => {
  logger.debug("app_mention event payload:\n\n" + JSON.stringify(event, null, 2) + "\n");
  if (~event.text.indexOf("チャンネルから退室")) {
    // matchした時
    const reaction = await client.reactions.add({
      "channel": event.channel,
      "name": "laptop_parrot",
      "timestamp": event.event_ts
    });
    const leave = await client.conversations.leave({
      "channel": event.channel
    });
    logger.debug("reaction result: \n" + JSON.stringify(reaction, null, 2) + "\n");
    logger.debug("leave result: \n " + JSON.stringify(leave, null, 2) + "\n");
    return leave;
  }
  const result = await say({ text: `:laptop_parrot: <@${event.user}> Hi!` });
  logger.debug("say result:\n\n" + JSON.stringify(result, null, 2) + "\n");
  return result

});

app.event("app_home_opened", async ({ logger, client, event, say }) => {
  await appHome({ logger, client, event, say });
});

app.shortcut("join-info-channel", async ({ logger, client, body, ack }) => {
  await openModal({ logger, client, ack, body });
});

app.command("/join-info-channel", async ({ logger, client, ack, body }) => {
  await openModal({ logger, client, ack, body });
});

app.view("join-info-res", async ({ logger, client, body, ack }) => {
  await handleViewSubmission({ logger, client, body, ack });
});


// ---------------------------------------------------------------

async function appHome({ logger, client, event, say }) {
  try {
    console.log(event);
    const blocks = [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "[理工情報]チャンネル窓口です :laptop_parrot:\n"
            + " *#理工情報* に参加しているメンバーは、このアプリを追加しているプライベートチャンネルに参加することができます。以下の2つの方法があります。\n"
            + " 1. `\\join-info-channel` と入力する\n"
            + " 2. ショートカット「理工情報プライベートチャンネル」を押す\n"
            + "\nアプリが不要になった場合、 チャンネル内で`@[理工情報]チャンネル窓口 チャンネルから退室して` とメンション付きメッセージを送ると退室してくれます。"
        }
      },
      {
        "type": "divider"
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "チャンネル情報(自動更新)"
        }
      }
    ]
    const channels = await getPCList(client).catch(() => []);
    const infoblock = [];
    for (i in channels) {
      const res = await client.conversations.info({
        "channel": channels[i],
        "include_num_members": true
      });
      if (res.ok) {
        infoblock.push({
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `*${res.channel.name}*\n`
              + `トピック: ${res.channel.topic.value}\n`
              + `説　　明: ${res.channel.purpose.value}\n`
              + `参加人数: ${res.channel.num_members}`
          }
        });
      }
    }
    if (event.tab === "home") {
      await client.views.publish({
        "user_id": event.user,
        "view": {
          "type": "home",
          "blocks": blocks.concat(infoblock).concat([
            {
              "type": "context",
              "elements": [
                {
                  "type": "mrkdwn",
                  "text": "Author: Riku Yamamoto(@yamamoto_s_a2r4r4)"
                }
              ]
            }
          ])
        }
      });
    }
  } catch (e) {
    logger.error("appHome" + e);
  }
}

async function openModal({ logger, client, ack, body }) {
  try {
    const channels = await getPrivateChannelList(client).catch(() => []);
    if (channels.length == 0) {
      channels.push({
        "text": {
          "type": "plain_text",
          "text": "NO CHANNEL DATA",
          "emoji": true
        },
        "value": "dummy"
      });
    }

    //console.log(channels);
    const res = await client.views.open({
      "trigger_id": body.trigger_id,
      // Block Kit Builder - http://j.mp/bolt-starter-modal-json
      "view": {
        "type": "modal",
        "callback_id": "join-info-res",
        "private_metadata": JSON.stringify(body),
        "title": {
          "type": "plain_text",
          "text": "プライベートチャンネルへ参加する",
          "emoji": true
        },
        "submit": {
          "type": "plain_text",
          "text": "参加申請",
          "emoji": true
        },
        "close": {
          "type": "plain_text",
          "text": "キャンセル",
          "emoji": true
        },
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "参加したい情報学科のチャンネルを選択してください。情報学科/総合理工学研究科のメンバーであればチャンネルへ招待します。もしチャンネルリストに追加したい方は、 *[理工情報]チャンネル窓口* をチャンネルに追加してください。"
            }
          },
          {
            "type": "divider"
          },
          {
            "type": "input",
            "block_id": "block_1",
            "element": {
              "type": "static_select",
              "action_id": "input",
              "placeholder": {
                "type": "plain_text",
                "text": "Select a channel",
                "emoji": true
              },
              "options": channels
            },
            "label": {
              "type": "plain_text",
              "text": "チャンネルを選択",
              "emoji": true
            }
          }
        ]
      }
    });
    logger.debug("views.open response:\n\n" + JSON.stringify(res, null, 2) + "\n");
    await ack();
  } catch (e) {
    logger.error("views.open error:\n\n" + JSON.stringify(e, null, 2) + "\n");
    await ack(`:x: Failed to open a modal due to *${e.code}* ...`);
  }
}

async function handleViewSubmission({ logger, client, body, ack }) {
  logger.debug("view_submission view payload:\n\n" + JSON.stringify(body.view, null, 2) + "\n");

  const stateValues = body.view.state.values;
  // 絶対に何かを選択しないとhandleされないのでエラーチェックは不要
  const selected_option = stateValues["block_1"]["input"]["selected_option"];
  const channelName = selected_option["text"]["text"];
  const channelId = selected_option["value"];
  let msg = "*" + channelName + "* への参加申請を受けつけました。";
  const userId = body.user.id;

  // データ送信
  await ack();
  // 理工情報メンバー全員取得（時間がかかりそう？）
  const members = await getInfoMembersList(process.env.MASTER_CHANNEL_ID, client).catch(err => {
    logger.error(err);
    return [];
  });
  // 情報判定
  if (members.length == 0) {
    msg = "システムエラーにより、 *" + channelName + "* への招待ができませんでした。";
  } else if (~members.indexOf(userId)) {
    //　メンバーに入っていればinviteする
    await client.conversations.invite({
      "channel": channelId,
      "users": body.user.id
    }).catch(err => {
      logger.error(err);
      msg = "Inviteエラーが発生したため、 *" + channelName + "* への招待ができませんでした。"
    });
  } else {
    msg = "*#理工情報* のメンバーではないため、 *" + channelName + "* への参加申請は却下されました。"
  }

  // メッセージを送信
  await client.chat.postMessage({
    "channel": body.user.id,
    "text": msg
  }).catch(logger.error);
}

// Utility to post a message using response_url
const axios = require('axios');
function postViaResponseUrl(responseUrl, response) {
  return axios.post(responseUrl, response);
}

// プライベートチャンネルの取得(cursor対応版)
async function getPrivateChannelList(client) {
  const param = {
    "types": "private_channel",
    "limit": 100 //default
  }
  let channels = []
  function pageLoaded(res) {
    console.log(res)
    res.channels.forEach(c => channels.push(
      {
        "text": {
          "type": "plain_text",
          "text": "#" + c.name,
          "emoji": true
        },
        "value": c.id
      }
    ));
    if (res.response_metadata && res.response_metadata.next_cursor && res.response_metadata.next_cursor !== '') {
      param.cursor = res.response_metadata.next_cursor;
      return client.users.conversations(param).then(pageLoaded);
    }
    return channels;
  }
  return client.users.conversations(param).then(pageLoaded);
}

// プライベートチャンネルの取得(cursor対応版)
async function getPCList(client) {
  const param = {
    "types": "private_channel",
    "limit": 100 //default
  }
  const channels = []
  function pageLoaded(res) {
    console.log(res)
    res.channels.forEach(c => channels.push(
      c.id
    ));
    if (res.response_metadata && res.response_metadata.next_cursor && res.response_metadata.next_cursor !== '') {
      param.cursor = res.response_metadata.next_cursor;
      return client.users.conversations(param).then(pageLoaded);
    }
    return channels;
  }
  return client.users.conversations(param).then(pageLoaded);
}

// infoのメンバーを全員取得する
async function getInfoMembersList(channelId, client) {
  const param = {
    "channel": channelId,
    "limit": 1000 // 理工学部情報学科は大体900人弱
  };
  let members = [];
  function pageLoaded(res) {
    res.members.forEach(m => members.push(m));
    if (res.response_metadata && res.response_metadata.next_cursor && res.response_metadata.next_cursor !== '') {
      param.cursor = res.response_metadata.next_cursor;
      return client.conversations.members(param).then(pageLoaded);
    }
    return members;
  }
  return client.conversations.members(param).then(pageLoaded);
}

// root
receiver.app.get("/", (_req, res) => {
  res.send("Your Bolt ⚡️ App is running!");
});

// root
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡️ Bolt app is running!");
})();

// プライベートチャンネルの取得
/*
    const conv = await client.users.conversations({
      "types": "private_channel",
      "limit": 100
    });
    let channels = []
    for (let i in conv.channels) {
      channels.push(
        {
          "text": {
            "type": "plain_text",
            "text": "#" + conv.channels[i]["name"],
            "emoji": true
          },
          "value": conv.channels[i]["id"]
        }
      );
    }
*/
