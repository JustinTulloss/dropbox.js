(function() {
    var BASE_URL = "https://api.dropbox.com/1/";
    var nonce = 1;

    function DropboxSession(appKey, appSecret, accessType) {
        this.appKey = appKey;
        this.appSecret = appSecret;
        this.accessType = accessType;
        this.requestTokenSecret = '';
    }
    var p = DropboxSession.prototype;

    p._generateOauthData = function() {
        return {
            oauth_consumer_key: this.appKey,
            oauth_token: this.requestToken,
            oauth_signature_method: 'PLAINTEXT',
            oauth_signature: encodeURIComponent(this.appSecret + '&' + this.requestTokenSecret),
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
                self.requestTokenSecret = parts[0].split('=')[1];
                self.requestToken = parts[1].split('=')[1];
                k();
            }
        });
    };

    p.buildAuthorizeUrl = function() {
        return 'https://www.dropbox.com/1/oauth/authorize?oauth_token=' + this.requestToken;
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
                self.accessTokenSecret = parts[0].split('=')[1];
                self.accessToken = parts[1].split('=')[1];
                self.uid = parts[2].split('=')[1];
                k();
            },
            error: function() {
                self.obtainAccessToken(k);
            }
        });
    };

    p.getState = function() {
        return {
            accessToken: this.accessToken,
            accessTokenSecret: this.accessTokenSecret
        };
    };

    p.setState = function(tokens) {
        this.accessToken = tokens.accessToken;
        this.accessTokenSecret = tokens.accessTokenSecret;
    };

    function DropboxClient(session) {
        this.session = session;
    }
    var c = DropboxClient.prototype;

    c._generateOauthData = function() {
        return {
            oauth_consumer_key: this.session.appKey,
            oauth_token: this.session.accessToken,
            oauth_signature_method: 'PLAINTEXT',
            oauth_signature: encodeURIComponent(this.session.appSecret + '&' + this.session.accessTokenSecret),
            oauth_nonce: nonce++,
            oauth_timestamp: Date.now()
        };
    };

    c.api = function(method, params, successCallback, errorCallback) {
        var data = this._generateOauthData();
        params = params || {};
        for (key in params) {
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

    c.shares = function(params, successCallback, errorCallback) {
        var url = this._getFileUrl('shares', params);
    };

    this.DropboxSession = DropboxSession;
    this.DropboxClient = DropboxClient;
})();
