document.addEventListener('DOMContentLoaded', function () {
  document.querySelector('#vocabulary').onclick = function () {
    chrome.tabs.create({ url: 'https://my.eudic.net/studyList' })
  }
  document.querySelector('#options').onclick = function () {
    chrome.tabs.create({ url: 'options.html' })
  }
})
