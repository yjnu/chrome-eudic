(async () => {
  const helper = chrome.runtime.getURL("js/utils.mjs")
  const {debugLogger, storageSettingMap, defaultIgnoreSites} = await import(helper)

  const storage = {}

  /**
   * 从chrome的storage里获取存储的插件的设置，如果有值，就给storage赋值，否者就使用默认的storageSettingMap
   * */
  const getStorage = new Promise((resolve) => {
      chrome.storage.sync.get('__eudicSettings', (settings) => {
          // debugLogger('info', 'chrome storage loaded');   // 加载配置输出日志
          if (Object.keys(settings).length) {
              settings.__eudicSettings.forEach((item) => {
                  Object.assign(storage, item);
              });
          } else {
              Object.assign(storage, storageSettingMap);
          }
          resolve();
      });
  });
  await getStorage;

  /**
   * 监听设置变化的事件，如果修改了设置，就更新全局的storage的值
   * */
  chrome.storage.onChanged.addListener(function (changes) {
    debugLogger('info', 'storage of Look up words and phrases was changed')
    changes.__eudicSettings.newValue.forEach(item => {
      Object.assign(storage, item)
    })
  })

  // 双击事件和划词后的事件处理器
  function handleSelection(event, altstatus=false, translate=false) {
      if (defaultIgnoreSites.some(site => location.hostname.includes(site))) 
        return
      if (storage.ignoreSites && storage.ignoreSites.some(site => location.hostname.includes(site))) 
        return

      const selection = window.getSelection().toString().trim();
      if (!selection)
        return

      if ( altstatus || (/^[a-z0-9A-Z]+$/.test(selection))) { 
          const x = event.pageX;
          const y = event.pageY;
          const windowWidth = window.innerWidth;
          const windowHeight = window.innerHeight;

          // 创建弹出窗口元素
          const popup = document.createElement('div');
          popup.style.position = 'fixed';
          
          // 调整弹窗位置到鼠标右边，距离鼠标40像素
          let newX = x + 25;
          const popupWidth = 200; // 假设弹窗宽度为200
          // if (newX + popupWidth > windowWidth) {
          //     newX = windowWidth - popupWidth;
          // }
          popup.style.left = newX + 'px';
          
          let newY = y + 25;
          const popupHeight = 100; // 假设弹窗高度为100
          // if (newY + popupHeight > windowHeight) {
          //     newY = windowHeight - popupHeight;
          // }
          popup.style.top = newY + 'px';
          
          // 创建弹出窗口元素
          popup.style.backgroundColor = '#eeeeee';
          popup.style.border = '1px solid #000';
          popup.style.padding = '5px';
          popup.style.zIndex = '10000';
          popup.style.minWidth = '21em';
          popup.style.minHeight = '9em';
          popup.style.width = '10em';
          popup.style.height = 'auto';
          popup.style.borderRadius = '5px';

          if (!altstatus) {

            // 创建所选单词及单词解释的元素及样式
            const h2 = document.createElement('h2');
            const h2link = document.createElement('a');
            h2.style.fontSize = '2em';
            h2.style.color = "#000000";
            const wordElement = document.createElement('div');
            wordElement.style.color = "#000000";
            
            // 金山查词
            chrome.runtime.sendMessage({action: 'iciba', msg: selection}, function(response) {
              if (response.iciba === 1) {
                h2link.textContent = response.word;
                response.definitions.forEach(def => {
                  const defs = document.createElement('p');
                  // defs.textContent = `${def.pos} ${def.def}`;
                  defs.textContent = def;
                  wordElement.appendChild(defs);
                 });
                
                 // 显示 h2 标题, 也就是所选单词
                h2link.href = `https://cn.bing.com/dict/${h2.textContent}`;
                h2link.target = '_blank';
                h2.appendChild(h2link);
                
                // 创建 svg 图片
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', '30');
                svg.setAttribute('height', '30');
                svg.style.cursor = 'pointer';   //  设置鼠标指针为手形
                svg.setAttribute('stroke','red')
                svg.style.padding = '0.3em 0 0 0';
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', 'M11.993 5.09691C11.0387 4.25883 9.78328 3.75 8.40796 3.75C5.42122 3.75 3 6.1497 3 9.10988C3 10.473 3.50639 11.7242 4.35199 12.67L12 20.25L19.4216 12.8944L19.641 12.6631C20.4866 11.7172 21 10.473 21 9.10988C21 6.1497 18.5788 3.75 15.592 3.75C14.2167 3.75 12.9613 4.25883 12.007 5.09692L12 5.08998L11.993 5.09691ZM12 7.09938L12.0549 7.14755L12.9079 6.30208L12.9968 6.22399C13.6868 5.61806 14.5932 5.25 15.592 5.25C17.763 5.25 19.5 6.99073 19.5 9.10988C19.5 10.0813 19.1385 10.9674 18.5363 11.6481L18.3492 11.8453L12 18.1381L5.44274 11.6391C4.85393 10.9658 4.5 10.0809 4.5 9.10988C4.5 6.99073 6.23699 5.25 8.40796 5.25C9.40675 5.25 10.3132 5.61806 11.0032 6.22398L11.0921 6.30203L11.9452 7.14752L12 7.09938Z');
                svg.appendChild(path);
                h2.appendChild(svg);

                // 添加生词点击事件监听器
                svg.addEventListener('click', function () {
                    chrome.runtime.sendMessage({action: 'addWord', msg: selection}, function(response) {
                      if (response.msg === 'success') {
                        svg.setAttribute('stroke', 'blue');
                      } 
                    });
                });
              } else {
                h2link.textContent = selection;
                // wordElement.textContent = '查询失败';
                wordElement.textContent = response.ret;

                // 显示 h2 标题, 也就是所选单词
                // h2link.textContent = selection;
                h2link.href = `https://cn.bing.com/dict/${selection}`;
                h2link.target = '_blank';
                h2.appendChild(h2link);
              }
              popup.appendChild(h2);
              popup.appendChild(wordElement);
            });
          } else if (storage.baiduKey && translate) {
            // 创建 tencentResult 元素
            const tencentHeead = document.createElement('h3');
            tencentHeead.textContent = '百度翻译';
            tencentHeead.style.color = "#000000";
            popup.appendChild(tencentHeead);

            const tencentResult = document.createElement('p');
            tencentResult.textContent = '正在查询中...';
            tencentResult.style.color = "#000000";
            popup.appendChild(tencentResult);

            chrome.runtime.sendMessage({action: 'baidu', msg: selection}, function(response) {
              tencentResult.textContent = response.bStatus === 1? response.ret : '查询失败';
            });
          }

          // 显示弹出窗口
          document.body.appendChild(popup);
          debugLogger('log', "查词划句", `${selection}`); 
          // 点击页面其他地方关闭弹出窗口
          // 点击页面其他地方关闭弹出窗口
          const closePopup = function (event) {
              if (!popup.contains(event.target) && 
                 (!((storage.drawKey === 'alt' && event.altKey) ||
                    (storage.drawKey === 'ctrl' && event.ctrlKey) ||
                    (storage.drawKey ==='shift' && event.shiftKey))) ) {
                  document.body.removeChild(popup);
                  document.removeEventListener('click', closePopup);
              }
          };
          document.addEventListener('click', closePopup);
    }
  }

  // 监听双击事件
  if (storage.clickLookup) {
    document.addEventListener('dblclick', function (event) {
        handleSelection(event, false, storage.translate);
    });
  }
  // 监听划词事件
  document.addEventListener('mouseup', function handleMouseUp(event) {
    if ((storage.translate) && ((storage.drawKey === 'alt' && event.altKey) ||
        (storage.drawKey === 'ctrl' && event.ctrlKey) ||
        (storage.drawKey ==='shift' && event.shiftKey))) {
      handleSelection(event, true, true);
    }
  });
})(); 