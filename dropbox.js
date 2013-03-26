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

    function ChunkedUploader (client, fileObj, length) {
        this.client = client;
        this.fileObj = fileObj;
        this.length = length;
        this.upload_id = '';
    }
    var cp = ChunkedUploader.prototype;

    cp.finish = function(params, successCallback, errorCallback, progressCallback) {
        if (!params.upload_id)
            params.upload_id = this.upload_id;
        this.client._fileapi('commit_chunked_upload', params, 
            successCallback,
            errorCallback,
            progressCallback
        );
    };

    cp.uploadChunked = function(chunk_size, successCallback, errorCallback, progressCallback){
        var $this = this,
            filedata = $this.fileObj,
            offset = 0, 
            length = $this.length,
            client = $this.client,
            upload = function(evt) {
                var data = (evt? JSON.parse(evt.target.responseText): null);
                if (data && data.upload_id)
                    $this.upload_id = data.upload_id;
                if (offset >= length) {
                    successCallback(evt);
                    return;
                }
                client._reader(filedata.slice(offset, offset + (chunk_size? chunk_size: 4194304)), {
                    loadend: function(evt) {
                        if (evt.target.readyState == FileReader.DONE){
                            var params = {
                                offset: offset,
                                fileObj: evt.target.result // 4194304 = 4MB (default chunk_size)
                            };
                            if ($this.upload_id)
                                params.upload_id = $this.upload_id;
                            offset = offset + (chunk_size? chunk_size: 4194304);
                            client._fileapi('chunked_upload', params,
                                upload,
                                errorCallback,
                                progressCallback
                            );
                        }
                    }
                });
            };
        upload();
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
        //if (!params || !params.path) {
        //    throw new Error("Must provide a path to work with files");
        //}
        var data = this._generateOauthData();
        var url = "https://api-content.dropbox.com/1/" ;
        var key;
        params = params || {};

        for (key in params) {
            if (params.hasOwnProperty(key)) {
                data[key] = params[key];
            }
        }

        var codedparams = (function(fd){ var p = []; for (var i in fd) if (i !== 'fileObj') p.push(i + '=' + (i.search('oauth_') === 0 ? fd[i]: encodeURIComponent(fd[i]))); return p; })(data).join('&'),
            root = this._getRoot() || '',
            xhr = $.ajax(), // new XMLHttpRequest();
            type = method !== 'commit_chunked_upload' && 'PUT' || 'POST';

        xhr.open(type, (method !== 'chunked_upload'? [url + method, root].join('/') : url + method) + (params.path? params.path: '') + '?' + codedparams, true);
        xhr.upload.onprogress = progressCallback;
        xhr.onprogress = progressCallback;
        xhr.onerror = errorCallback;
        xhr.onreadystatechange = function(evt) {
            if (this.readyState == 4 && this.status == 200) {
                successCallback(evt);
            }
        };
        xhr.overrideMimeType(data.mimeType);
        xhr.setRequestHeader('Content-Type', data.mimeType);

        if (type === 'PUT') {
            if (xhr.sendAsBinary)
                xhr.sendAsBinary(params.fileObj);
            else {
                var buf = Array.prototype.map.call(params.fileObj, function(x){return x.charCodeAt(0) & 0xff;});
                var ui8a = new Uint8Array(buf, 0);
                xhr.send(ui8a.buffer);
            }
        }
        else 
            xhr.send(codedparams);
    };

    c._reader = function(fileObj, callbacks){
        var reader = new FileReader();
        reader.onload = callbacks && callbacks.load;
        reader.onloadstart = callbacks && callbacks.loadstart;
        reader.onloadend = callbacks && callbacks.loadend;
        reader.onprogress = callbacks && callbacks.progress;
        reader.onabort = callbacks && callbacks.abort;
        reader.readAsBinaryString(fileObj);
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
        
        this._reader(data.fileObj, { 
            loadend: function(evt){
                if (evt.target.readyState == FileReader.DONE){
                    params.fileObj = evt.target.result;
                    this._fileapi('files_put', params,
                        successCallback,
                        errorCallback,
                        progressCallback);
                }
            }
        });
    };

    c.shares = function(params, successCallback, errorCallback) {
        var url = this._getFileUrl('shares', params);
    };

    c.getChunkedUploader = function (fileObj, length){
        return new ChunkedUploader(this, fileObj, length);
    };

    this.Dropbox = {
        Session: Session,
        Client: Client
    };
})();
