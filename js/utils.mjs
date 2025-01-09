/** 检测是否是开发模式，用来控制日志的输出
 * @type {boolean}
 * */
const devMode = !("update_url" in chrome.runtime.getManifest());

/**
 * 开发模式的log打印
 * @function debugLogger
 * @param {string} 属于console的任何log的等级
 * @param {*} msg log信息
 * @summary 如果是任何情况下都要打印的信息，就用console，如果只是调试的信息，就用debugLogger
 * */
export const debugLogger = (level, ...msg) => {
  if (devMode) console[level](...msg);
};

/**
 * 扩展设置的名称、名称的说明、取值范围的数组
 * @namespace {Array} extensionSpecification
 * @property {string} * - 各种名称
 * @property {string} desc - 名称的说明
 * @property {Array} enum - 取值范围
 * */
const extensionSpecification = [
  {clickLookup: true, desc: "双击查词",  enum: [true, false], type: "radio"},
  {drawLookup: true, desc: "划词查句",  enum: [true, false], type: "radio"},
  {drawKey: "ctrl", desc: "划词按键", enum: ["alt", "ctrl", "shift"], type: "select"},
  {translate: false, desc: "句子翻译功能", enum: [true, false], type: "radio"},
  {ignoreSites: [], desc: "忽略站点", type: "textarea"},
  {eudicKey: '', desc: '欧路API', type: 'text'},
  {baiduId: '', desc: '百度翻译ID', type: 'text'},
  {baiduKey: '', desc: '百度翻译KEY', type: 'text'}
];

// 默认屏蔽的网站
export const defaultIgnoreSites = ["eudic.net", "shanbay.com"];

/**
 * 由extensionSpecification去除描述和取值范围之后生成的真正能使用的数组
 * a array of {settingName: value}
 * @type {Array}
 * @see extensionSpecification
 * */
export const storageSettingArray = extensionSpecification.map((setting) => {
  delete setting.enum;
  delete setting.desc;
  return setting;
});

/**
 * 由storageSettingArray数组生成的map
 * @type {Object}
 * */
export let storageSettingMap = {};
storageSettingArray.forEach((item) => {
  Object.assign(storageSettingMap, item);
});

// 添加单词到生词本
export async function addNewWord(word, eudicKey) {
    const headers = {
        'Authorization': eudicKey,
        'Content-Type': 'application/json'
    };

    const data = {
        "id": "0",
        "language": "en",
        "words": [word]
    };
    try {
      const response = await fetch('https://api.frdic.com/api/open/v1/studylist/words', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(data)
      });
      debugLogger('log', "添加生词返回状态码: ", response.status);
      const responseData = {
          status: response.status,
          data: await response.json().catch(() => null) // 尝试解析 JSON 数据
      };
      return responseData;
      } catch (error) {
        debugLogger('error', '添加生词请求错误: ', error);
        return {
            status: -1,
            error: error.message
        };
    }
}

// 扇贝查词, 需要登录, 不好用
export async function shanbay(word) {
    return fetch(`https://apiv3.shanbay.com/abc/words/senses?vocabulary_content=${word}`)
      .then(response => response.json())
      .then(data => {
            if ("msg" in data) {
              return {
                  shanbayRet: 0,
                  msg: data.msg
              };
            } else { 
              const cnDefinitions = data.definitions.cn;
              const result = [];
              cnDefinitions.forEach(definition => {
                  result.push({
                      pos: definition.pos,
                      def: definition.def
                  });
              });
              return {
                  shanbayRet: 1,
                  content: data.content,
                  definitions: result
              };
            }
        })
      .catch(error => {
            debugLogger('error', 'shanbay Error fetching data:', error);
            return [];
        });
}

// 金山词典
export async function iciba(word) {
    return fetch(`http://dict-mobile.iciba.com/interface/index.php?c=word&m=getsuggest&nums=1&client=6&is_need_mean=1&word=${word}`)
     .then(response => response.json())
     .then(data => {
            if (data.message && data.message.length > 0) {
                const paraphrase = data.message[0].paraphrase;
                const defs = paraphrase.split(';');
                return {
                    iciba: 1,
                    word: data.message[0].key,
                    definitions: defs
                };
            } else {
                return { iciba: 0, ret: "暂无释义" };
            }
        })
     .catch(error => {
            debugLogger('error', '金山词典 Error', error);
            return { iciba: 0, ret: "请求错误" };
        });
}

// 腾讯翻译
class tencentTranslator {
    constructor(word) {
        this.word = word;
        // 公用参数
        this.SECRET_ID = storageSettingMap.tencentSecretId;
        this.SECRET_KEY = storageSettingMap.tencentSecretKey;
        this.host = "tmt.tencentcloudapi.com";
        this.timestamp = Math.floor(Date.now() / 1000);
        this.date = tencentTranslator.getDate(this.timestamp);
        this.payloadStr = `{"SourceText":"${this.word}", "Source":"auto", "Target":"zh","ProjectId":0}`;
        this.payload = JSON.stringify(JSON.parse(this.payloadStr));
    }

    // 使用 CryptoJS 或者浏览器原生 SubtleCrypto
    static async sha256(message, secret = "") {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
        return Array.from(new Uint8Array(signature))
         .map((b) => b.toString(16).padStart(2, "0"))
         .join("");
    }

    // 获取哈希值
    static async getHash(message) {
        const encoder = new TextEncoder();
        const hash = await crypto.subtle.digest("SHA-256", encoder.encode(message));
        return Array.from(new Uint8Array(hash))
         .map((b) => b.toString(16).padStart(2, "0"))
         .join("");
    }

    // 获取日期
    static getDate(timestamp) {
        const date = new Date(timestamp * 1000);
        const year = date.getUTCFullYear();
        const month = ("0" + (date.getUTCMonth() + 1)).slice(-2);
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    async tencentFetch() {
        // 步骤 1: 拼接规范请求串
        const signedHeaders = "content-type;host";
        const hashedRequestPayload = await tencentTranslator.getHash(this.payload);
        const httpRequestMethod = "POST";
        const canonicalUri = "/";
        const canonicalQueryString = "";
        const canonicalHeaders =
            "content-type:application/json; charset=utf-8\n" + "host:" + this.host + "\n";

        const canonicalRequest =
            httpRequestMethod +
            "\n" +
            canonicalUri +
            "\n" +
            canonicalQueryString +
            "\n" +
            canonicalHeaders +
            "\n" +
            signedHeaders +
            "\n" +
            hashedRequestPayload;

        // 步骤 2: 拼接待签名字符串
        const algorithm = "TC3-HMAC-SHA256";
        const hashedCanonicalRequest = await tencentTranslator.getHash(canonicalRequest);
        const credentialScope = this.date + "/tmt/tc3_request";
        const stringToSign =
            algorithm +
            "\n" +
            this.timestamp +
            "\n" +
            credentialScope +
            "\n" +
            hashedCanonicalRequest;

        // 步骤 3: 计算签名
        const kDate = await tencentTranslator.sha256(this.date, "TC3" + this.SECRET_KEY);
        const kService = await tencentTranslator.sha256("tmt", kDate);
        const kSigning = await tencentTranslator.sha256("tc3_request", kService);
        const signature = await tencentTranslator.sha256(stringToSign, kSigning);

        // 步骤 4: 拼接 Authorization
        const authorization =
            algorithm +
            " " +
            "Credential=" +
            this.SECRET_ID +
            "/" +
            credentialScope +
            ", " +
            "SignedHeaders=" +
            signedHeaders +
            ", " +
            "Signature=" +
            signature;

        // 步骤 5: 发起请求
        const headers = {
            Authorization: authorization,
            "Content-Type": "application/json; charset=utf-8",
            Host: this.host,
            "X-TC-Action": "TextTranslate",
            "X-TC-Timestamp": this.timestamp.toString(),
            "X-TC-Version": "2018-03-21",
            "X-TC-Region": storageSettingMap.tencentRegion,
        };
        return await fetch(`https://${this.host}`, {
            method: "POST",
            headers,
            body: this.payload,
        })
        .then((response) => {
            const data = response.json();
            return {
              tStatus: 1,
              ret: data.Response.TargetText
            }
          })
         .catch((error) => {
            debugLogger("error", "腾讯翻译请求错误: ", error);
                return{
                  tStatus: 0,
                  ret: "翻译失败"
                }       
            });
    }
}
export default tencentTranslator;

// 百度翻译
var MD5 = function (string) {
  
    function RotateLeft(lValue, iShiftBits) {
        return (lValue<<iShiftBits) | (lValue>>>(32-iShiftBits));
    }
  
    function AddUnsigned(lX,lY) {
        var lX4,lY4,lX8,lY8,lResult;
        lX8 = (lX & 0x80000000);
        lY8 = (lY & 0x80000000);
        lX4 = (lX & 0x40000000);
        lY4 = (lY & 0x40000000);
        lResult = (lX & 0x3FFFFFFF)+(lY & 0x3FFFFFFF);
        if (lX4 & lY4) {
            return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
        }
        if (lX4 | lY4) {
            if (lResult & 0x40000000) {
                return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
            } else {
                return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
            }
        } else {
            return (lResult ^ lX8 ^ lY8);
        }
    }
  
    function F(x,y,z) { return (x & y) | ((~x) & z); }
    function G(x,y,z) { return (x & z) | (y & (~z)); }
    function H(x,y,z) { return (x ^ y ^ z); }
    function I(x,y,z) { return (y ^ (x | (~z))); }
  
    function FF(a,b,c,d,x,s,ac) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    };
  
    function GG(a,b,c,d,x,s,ac) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    };
  
    function HH(a,b,c,d,x,s,ac) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    };
  
    function II(a,b,c,d,x,s,ac) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    };
  
    function ConvertToWordArray(string) {
        var lWordCount;
        var lMessageLength = string.length;
        var lNumberOfWords_temp1=lMessageLength + 8;
        var lNumberOfWords_temp2=(lNumberOfWords_temp1-(lNumberOfWords_temp1 % 64))/64;
        var lNumberOfWords = (lNumberOfWords_temp2+1)*16;
        var lWordArray=Array(lNumberOfWords-1);
        var lBytePosition = 0;
        var lByteCount = 0;
        while ( lByteCount < lMessageLength ) {
            lWordCount = (lByteCount-(lByteCount % 4))/4;
            lBytePosition = (lByteCount % 4)*8;
            lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount)<<lBytePosition));
            lByteCount++;
        }
        lWordCount = (lByteCount-(lByteCount % 4))/4;
        lBytePosition = (lByteCount % 4)*8;
        lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80<<lBytePosition);
        lWordArray[lNumberOfWords-2] = lMessageLength<<3;
        lWordArray[lNumberOfWords-1] = lMessageLength>>>29;
        return lWordArray;
    };
  
    function WordToHex(lValue) {
        var WordToHexValue="",WordToHexValue_temp="",lByte,lCount;
        for (lCount = 0;lCount<=3;lCount++) {
            lByte = (lValue>>>(lCount*8)) & 255;
            WordToHexValue_temp = "0" + lByte.toString(16);
            WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length-2,2);
        }
        return WordToHexValue;
    };
  
    function Utf8Encode(string) {
        string = string.replace(/\r\n/g,"\n");
        var utftext = "";
  
        for (var n = 0; n < string.length; n++) {
  
            var c = string.charCodeAt(n);
  
            if (c < 128) {
                utftext += String.fromCharCode(c);
            }
            else if((c > 127) && (c < 2048)) {
                utftext += String.fromCharCode((c >> 6) | 192);
                utftext += String.fromCharCode((c & 63) | 128);
            }
            else {
                utftext += String.fromCharCode((c >> 12) | 224);
                utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                utftext += String.fromCharCode((c & 63) | 128);
            }
  
        }
  
        return utftext;
    };
  
    var x=Array();
    var k,AA,BB,CC,DD,a,b,c,d;
    var S11=7, S12=12, S13=17, S14=22;
    var S21=5, S22=9 , S23=14, S24=20;
    var S31=4, S32=11, S33=16, S34=23;
    var S41=6, S42=10, S43=15, S44=21;
  
    string = Utf8Encode(string);
  
    x = ConvertToWordArray(string);
  
    a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;
  
    for (k=0;k<x.length;k+=16) {
        AA=a; BB=b; CC=c; DD=d;
        a=FF(a,b,c,d,x[k+0], S11,0xD76AA478);
        d=FF(d,a,b,c,x[k+1], S12,0xE8C7B756);
        c=FF(c,d,a,b,x[k+2], S13,0x242070DB);
        b=FF(b,c,d,a,x[k+3], S14,0xC1BDCEEE);
        a=FF(a,b,c,d,x[k+4], S11,0xF57C0FAF);
        d=FF(d,a,b,c,x[k+5], S12,0x4787C62A);
        c=FF(c,d,a,b,x[k+6], S13,0xA8304613);
        b=FF(b,c,d,a,x[k+7], S14,0xFD469501);
        a=FF(a,b,c,d,x[k+8], S11,0x698098D8);
        d=FF(d,a,b,c,x[k+9], S12,0x8B44F7AF);
        c=FF(c,d,a,b,x[k+10],S13,0xFFFF5BB1);
        b=FF(b,c,d,a,x[k+11],S14,0x895CD7BE);
        a=FF(a,b,c,d,x[k+12],S11,0x6B901122);
        d=FF(d,a,b,c,x[k+13],S12,0xFD987193);
        c=FF(c,d,a,b,x[k+14],S13,0xA679438E);
        b=FF(b,c,d,a,x[k+15],S14,0x49B40821);
        a=GG(a,b,c,d,x[k+1], S21,0xF61E2562);
        d=GG(d,a,b,c,x[k+6], S22,0xC040B340);
        c=GG(c,d,a,b,x[k+11],S23,0x265E5A51);
        b=GG(b,c,d,a,x[k+0], S24,0xE9B6C7AA);
        a=GG(a,b,c,d,x[k+5], S21,0xD62F105D);
        d=GG(d,a,b,c,x[k+10],S22,0x2441453);
        c=GG(c,d,a,b,x[k+15],S23,0xD8A1E681);
        b=GG(b,c,d,a,x[k+4], S24,0xE7D3FBC8);
        a=GG(a,b,c,d,x[k+9], S21,0x21E1CDE6);
        d=GG(d,a,b,c,x[k+14],S22,0xC33707D6);
        c=GG(c,d,a,b,x[k+3], S23,0xF4D50D87);
        b=GG(b,c,d,a,x[k+8], S24,0x455A14ED);
        a=GG(a,b,c,d,x[k+13],S21,0xA9E3E905);
        d=GG(d,a,b,c,x[k+2], S22,0xFCEFA3F8);
        c=GG(c,d,a,b,x[k+7], S23,0x676F02D9);
        b=GG(b,c,d,a,x[k+12],S24,0x8D2A4C8A);
        a=HH(a,b,c,d,x[k+5], S31,0xFFFA3942);
        d=HH(d,a,b,c,x[k+8], S32,0x8771F681);
        c=HH(c,d,a,b,x[k+11],S33,0x6D9D6122);
        b=HH(b,c,d,a,x[k+14],S34,0xFDE5380C);
        a=HH(a,b,c,d,x[k+1], S31,0xA4BEEA44);
        d=HH(d,a,b,c,x[k+4], S32,0x4BDECFA9);
        c=HH(c,d,a,b,x[k+7], S33,0xF6BB4B60);
        b=HH(b,c,d,a,x[k+10],S34,0xBEBFBC70);
        a=HH(a,b,c,d,x[k+13],S31,0x289B7EC6);
        d=HH(d,a,b,c,x[k+0], S32,0xEAA127FA);
        c=HH(c,d,a,b,x[k+3], S33,0xD4EF3085);
        b=HH(b,c,d,a,x[k+6], S34,0x4881D05);
        a=HH(a,b,c,d,x[k+9], S31,0xD9D4D039);
        d=HH(d,a,b,c,x[k+12],S32,0xE6DB99E5);
        c=HH(c,d,a,b,x[k+15],S33,0x1FA27CF8);
        b=HH(b,c,d,a,x[k+2], S34,0xC4AC5665);
        a=II(a,b,c,d,x[k+0], S41,0xF4292244);
        d=II(d,a,b,c,x[k+7], S42,0x432AFF97);
        c=II(c,d,a,b,x[k+14],S43,0xAB9423A7);
        b=II(b,c,d,a,x[k+5], S44,0xFC93A039);
        a=II(a,b,c,d,x[k+12],S41,0x655B59C3);
        d=II(d,a,b,c,x[k+3], S42,0x8F0CCC92);
        c=II(c,d,a,b,x[k+10],S43,0xFFEFF47D);
        b=II(b,c,d,a,x[k+1], S44,0x85845DD1);
        a=II(a,b,c,d,x[k+8], S41,0x6FA87E4F);
        d=II(d,a,b,c,x[k+15],S42,0xFE2CE6E0);
        c=II(c,d,a,b,x[k+6], S43,0xA3014314);
        b=II(b,c,d,a,x[k+13],S44,0x4E0811A1);
        a=II(a,b,c,d,x[k+4], S41,0xF7537E82);
        d=II(d,a,b,c,x[k+11],S42,0xBD3AF235);
        c=II(c,d,a,b,x[k+2], S43,0x2AD7D2BB);
        b=II(b,c,d,a,x[k+9], S44,0xEB86D391);
        a=AddUnsigned(a,AA);
        b=AddUnsigned(b,BB);
        c=AddUnsigned(c,CC);
        d=AddUnsigned(d,DD);
    }
  
    var temp = WordToHex(a)+WordToHex(b)+WordToHex(c)+WordToHex(d);
  
    return temp.toLowerCase();
}

// 百度翻译
export async function baiduTranslate(query, appid, key) {
    const salt = new Date().getTime();
    const from = 'en';
    const to = 'zh';
    const str1 = appid + query + salt + key;
    const sign = MD5(str1);

    const url = `http://api.fanyi.baidu.com/api/trans/vip/translate?q=${encodeURIComponent(query)}&appid=${appid}&salt=${salt}&from=${from}&to=${to}&sign=${sign}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        return data.trans_result[0].dst;
    } catch (error) {
        console.error('请求出错:', error);
        return "百度翻译出错";
    }
}
