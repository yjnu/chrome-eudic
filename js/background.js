import tencentTranslator, { debugLogger, storageSettingMap, addNewWord, shanbay, baiduTranslate } from './utils.mjs'


// 插件安装时，打开插件的设置页面
chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason === 'install') {
        chrome.runtime.openOptionsPage();
    }
});

const storage = {}

// 从chrome的storage里获取存储的插件的设置，如果有值，就给storage赋值，否者就使用默认的storageSettingMap
chrome.storage.sync.get('__eudicSettings', (settings) => {
  if (Object.keys(settings).length) {
    settings.__eudicSettings.forEach(item => {
      Object.assign(storage, item)
    })
  } else {
    Object.assign(storage, storageSettingMap)
  }
});

// 监听 storage 变化, 更新 storage
chrome.storage.onChanged.addListener(changes => {
    const settings = changes.__eudicSettings.newValue
    if (Object.keys(settings).length) {
        settings.forEach(item => {
        Object.assign(storage, item)
    })
  }
})

// 接收 content 消息
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  switch (request.action) {
    case 'addWord':
      addNewWord(request.msg, storage.eudicKey).then(response => {
          if (response.status === 201) {
              sendResponse({msg: "success"})
          } else {
              sendResponse({msg: "fail"})
              debugLogger('error', response.status, response.data || response.error);
          }
      }).catch(error => {
          sendResponse({msg: "添加失败"})
          debugLogger('error', '处理添加生词响应时错误: ', error)
      });
      break;
    case 'shanbay':  
      shanbay(request.msg).then(response => {
          sendResponse(response);
          debugLogger('info', "扇贝查询成功")
      }).catch(error => {
          sendResponse( {shanbayRet: 0, msg: error})
        });
      break;
    case 'bing':
      bingDict(request.msg).then(response => {
          sendResponse(response);
          debugLogger('info', "必应查询成功")
      }).catch(error => {
          sendResponse({head: request.msg ,ret: error})
          debugLogger('error', '必应查询出错', error)
        });
      break;
    case 'baidu':
      baiduTranslate(request.msg, storage.baiduId, storage.baiduKey).then(response => {
          sendResponse({bStatus: 1, ret: response});
          debugLogger('info', "百度翻译成功")
      }).catch(error => {
          sendResponse({bStatus: 0, ret: "翻译失败"})
          debugLogger('error', '百度查询出错', error)
        });
      break;
    case 'tencent':
      const tencent = new tencentTranslator(request.msg)
      tencent.tencentFetch()
      .then((response) => {
          sendResponse(response)
        })
      .catch((error) => {
          sendResponse({tStatus: 0, ret: "翻译失败"})
          debugLogger('error', '腾讯翻译错误: ', error)
        });
      // sendResponse({tStatus: 0, ret: "翻译失败"})
      break;
  }
  return true; // 由于使用了异步操作，需要返回 true 以保持 sendResponse 可用
});
