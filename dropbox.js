(function() {
    var BASE_URL = "https://api.dropbox.com/1/";
    var nonce = 1;

    function Session(appKey, appSecret, accessType) {
        this.appKey = appKey;
        this.appSecret = appSecret;
        this.accessType = accessType;
        this.token = {
            key: '',
            secret: ''
        };
    }
    var p = Session.prototype;

    p._generateOauthData = function() {
        return {
            oauth_consumer_key: this.appKey,
            oauth_token: this.token.key,
            oauth_signature_method: 'PLAINTEXT',
            oauth_signature: encodeURIComponent(this.appSecret + '&' + this.token.secret),
            oauth_nonce: nonce++,
            oauth_timestamp: Date.now()
        };
    };

    p.obtainRequestToken = function(k) {
        var self = this;
        $.ajax({
            url: BASE_URL + 'oauth/request_token?callback=?',
            dataType: 'jsonp',
            data: this._generateOauthData(),
            success: function(resp) {
                var parts = resp.split('&');
                self.token.secret = parts[0].split('=')[1];
                self.token.key = parts[1].split('=')[1];
                k();
            }
        });
    };

    p.buildAuthorizeUrl = function() {
        return 'https://www.dropbox.com/1/oauth/authorize?oauth_token=' + this.token.key;
    };

    p.obtainAccessToken = function(k) {
        var self = this;
        $.ajax({
            url: BASE_URL + 'oauth/access_token?callback=?',
            dataType: 'jsonp',
            data: this._generateOauthData(),
            timeout: 1000,
            success: function(resp) {
                var parts = resp.split('&');
                self.token.secret = parts[0].split('=')[1];
                self.token.key = parts[1].split('=')[1];
                self.uid = parts[2].split('=')[1];
                k();
            },
            error: function() {
                self.obtainAccessToken(k);
            }
        });
    };

    p.setToken = function(token) {
        this.token = token;
    };

    function Client(session) {
        this.session = session;
    }
    var c = Client.prototype;

    c._generateOauthData = function() {
        return {
            oauth_consumer_key: this.session.appKey,
            oauth_token: this.session.token.key,
            oauth_signature_method: 'PLAINTEXT',
            oauth_signature: encodeURIComponent(this.session.appSecret + '&' + this.session.token.secret),
            oauth_nonce: nonce++,
            oauth_timestamp: Date.now()
        };
    };

    c.api = function(method, params, successCallback, errorCallback) {
        var data = this._generateOauthData();
        var formdata = new FormData();
        params = params || {};
        for (var key in params) {
            if (params.hasOwnProperty(key)) {
                data[key] = params[key];
            }
        }

        $.ajax({
            url: BASE_URL + method,
            dataType: 'jsonp',
            data: data,
            success: successCallback,
            error: errorCallback
        });
    };

    c._fileapi = function(method, params, successCallback, errorCallback, progressCallback) {
        if (!params || !params.path) {
            throw new Error("Must provide a path to work with files");
        }
        var data = this._generateOauthData();
        var url = "https://api-content.dropbox.com/1/" ;
        var key;
        params = params || {};

        for (key in params) {
            if (params.hasOwnProperty(key)) {
                data[key] = params[key];
            }
        }

        var codedparams = (function(fd){ var p = []; for (var i in fd) if (i !== 'fileObj') p.push(i + '=' + (i.search('oauth_') === 0 ? fd[i]: encodeURIComponent(fd[i]))); return p; })(data).join('&');

        var reader = new FileReader();
        var root = this._getRoot();
        var result = "", start = 0;
        reader.onloadend = function(evt){
            if (evt.target.readyState == FileReader.DONE){
                var xhr = $.ajax(); // new XMLHttpRequest();
                xhr.open('PUT', [url + method, root].join('/') + (params.path? params.path: '') + '?' + codedparams, true);
                xhr.upload.onprogress = progressCallback;
                xhr.onerror = errorCallback;
                xhr.onreadystatechange = function(evt) {
                    if (this.readyState == 4 && this.status == 200) {
                        successCallback(evt);
                    }
                };
                xhr.overrideMimeType(data.mimeType);
                xhr.setRequestHeader('Content-Type', data.mimeType);
                xhr.sendAsBinary(evt.target.result);
            }
        };
        reader.readAsBinaryString(data.fileObj);
    };

    c._getRoot = function() {
        return this.session.accessType == 'dropbox' ? 'dropbox' : 'sandbox';
    };

    c._getPath = function(params) {
        if (!params || !params.path) {
            throw new Error("Must provide a path to get metadata from");
        }
        var path = params.path;
        delete params.path;
        return path;
    };

    c._getFileUrl = function(prefix, params) {
        var root = this._getRoot();
        var path = this._getPath(params);
        return [prefix, root, path].join('/');
    };

    c.accountInfo = function(successCallback, errorCallback) {
        this.api('account/info', {}, successCallback, errorCallback);
    };

    c.metadata = function(params, successCallback, errorCallback) {
        var url = this._getFileUrl('metadata', params);
        this.api(url, params, successCallback, errorCallback);
    };

    c.putFile = function(params, successCallback, errorCallback, progressCallback) {
        params.overwrite = params.overwrite || false;
        params.mimeType = params.fileObj.type || 'text/plain';
        
        this._fileapi('files_put', params, successCallback, errorCallback, progressCallback);
    };

    c.shares = function(params, successCallback, errorCallback) {
        var url = this._getFileUrl('shares', params);
    };

    this.Dropbox = {
        Session: Session,
        Client: Client
    };
})();
