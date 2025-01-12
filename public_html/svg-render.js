/*
 * @copyright Adam Benda, 2016
 *
 */


/* global Blob, File, SVGSVGElement, EventTarget */

/**
 * @classdesc SVG Rendering library
 * @class
 */
var SVGRender = function () {

    /**
     * Last error message. Retrieve with method getErrorMessage()
     * @type {String}
     * @private
     */
    this.errMessage = "";
};

/**
 * Loads one SVG image from various source.
 * Will wipe out previously loaded image
 * @param {SVGSVGElement |  Blob | File | String} svg - svg element or its source
 * @param {function} callback with parameters (err, SVGRender)
 * @returns {undefined}
 *
 * @public
 **/
SVGRender.prototype.load = function (svg, callback) {


    /**
     * Loading from a file is asynchronous = do not call render() untill file is loaded.
     * @type {Boolean}
     * @private
     */
    this.loaded = false;
    /**
     * Signalizes that computation was interrupted/paused
     * @type {Boolean}
     */
    this.interrupted = false;

    /**
     * @type {function}
     */
    this.afterLoadCB = callback;
    if (!this.afterLoadCB) {
        this.afterLoadCB = function () {};
    }

    /**
     * Signalizes that computation finished sucessfully
     * @type Boolean
     */
    this.finished = false;
    if (Blob.prototype.isPrototypeOf(svg) || File.prototype.isPrototypeOf(svg)) {
        //to be read with FileReader
        if (!svg.type || svg.type !== "image/svg+xml") {
            throw "Wrong file/blob type, should be image/svg+xml, is " + svg.type;
        }

        /**
         * File reader of input File / Blob
         * @type {FileReader}
         * @private
         */
        this.reader = new FileReader();
        this.reader.readAsDataURL(svg);
        this.reader.onload = function () {
            //File was loaded from input to dataURI

            //http://stackoverflow.com/questions/11335460/how-do-i-parse-a-data-url-in-node
            var svgCodeB64 = this.reader.result;
            var regex = /^data:.+\/(.+);base64,(.*)$/;
            var matches = svgCodeB64.match(regex);
            var data = matches[2];
            var svgCode = atob(data);
            this.load.bind(this)(svgCode, this.afterLoadCB);
            //Call load function again - but with svg source loaded from file
            return;
        }.bind(this);
        return;
    } else if (typeof svg === "string") {
        //svg xml code
        var svgCode = svg;
        //var svgCode = this.result.replace(/<?xml[^>]*/,"").replace(/<!DOCTYPE[^>]*/,"");

        //We are using document from global namespace
        //todo: cleanup afterwards
        this.svgDivElement = document.createElement('div');
        this.svgDivElement.innerHTML = svgCode;
        var svgElement = this.svgDivElement.children[0];
        document.body.appendChild(this.svgDivElement);
        this.svgDivElement.style.visibility = 'hidden';
        this.load(svgElement, this.afterLoadCB);
        return;
    } else if (SVGSVGElement.prototype.isPrototypeOf(svg)) {

        /**
         * SVG element present in document.
         * @type {SVGSVGElement}
         * @private
         */
        this.svgElement = svg;
        this.loaded = true;
        //finally call the callback
        setTimeout(function () {
            this.afterLoadCB(null, this);
        }.bind(this), 0);

        return;
    } else {
        throw "Unknown svg type in svg-render!";
    }
};


var stream, recorder;


/**
 * Start rendering
 * @param {Object} options - contains numbers FPS, time, imagesCount and function progressSignal
 * @param {function} callback
 * @returns {boolean} if the rendering was started
 *
 * @public
 */
SVGRender.prototype.render = function (options, callback) {
    if (!options) {
        options = {};
    }

    /**
     * Will be called after rendering is finished
     * @type {function}
     */
    this.callback = callback;
    if (!this.callback) {
        this.callback = function () {};
    }

    if (!this.loaded) {
        //todo: more elegant solution
        this.errMessage = "Input file not loaded yet";
        return false;
    }

    /**
     * Function to be called repeatedly when frame is rendered.
     * has two parameters; count(total #frames) and doneCount(#frames rendered)
     * @type {function}
     * @private
     */
    this.progressSignal = (options.progressSignal || function () {});
    /**
     * begin time (seconds)
     * @type {number}
     * @private
     */
    this.beginMS = (options.begin * 1000 || 0); //default begin time


    /**
     * Frames per Second
     * @type {number}
     * @private
     */
    this.FPS = (options.FPS || 60); //default FPS


    /**
     * total time in miliseconds
     * @type {number}
     * @private
     */
    this.timeMS = (options.time * 1000 || 1000);
    /**
     * Number of frames to render
     * @type {number}
     * @private
     */
    this.imagesCount = Math.round(this.FPS * this.timeMS / 1000);
    if (options.imagesCount && options.imagesCount !== this.imagesCount) {
        //imagesCount was given
        if (options.time && options.FPS) {
            //FPS+time were also given and the tree given parameters are contradicting
            this.finished = true;
            this.errMessage = "Conflicting parameters FPS,time,imagesCount";
            return false;
        } else if (options.time) {
            this.FPS = this.imagesCount * 1000 / this.timeMS;
        } else if (options.FPS) {
            this.timeMS = this.imagesCount * 1000 / this.FPS;
        }
    }

    /**
     * Time in miliseconds from the animation start time.
     * @type {int}
     * @private
     */
    this.SVGtime = 0; //in miliseconds

    /**
     * Number of already rendered images
     * @type {int}
     * @public
     */
    this.imagesDoneCount = 0;
    /**
     * Array of all rendered images in png format
     * @type {base64}
     * @public
     */
    this.images = [];
    /**
     * Array of all rendered images in png format
     * @type {number}
     * @private
     */
    this.nextFrame = setTimeout(this.renderNextFrame.bind(this), 0);
    /**
     * Canvas to draw on (optional - drawing is invisible if not provided)
     * @type {HTMLCanvasElement}
     * @private
     */
    this.canvas = (options.canvas || document.createElement('canvas')); //default begin time

    this.canvas.height = 500;
    this.canvas.width = 500;

    stream = this.canvas.captureStream();

    recorder = new MediaRecorder(stream, {
        mimeType: 'video/x-matroska',
        audioBitsPerSecond: 1000000, // 1 Mbps
        bitsPerSecond: 3000000      // 2 Mbps
        // videoBitsPerSecond will also be 2 Mbps
    });

    recorder.ondataavailable = function(e) {
        const allChunks = [];
        allChunks.push(e.data);
        const fullBlob = new Blob(allChunks);

        // ... which we can download using HTML5 `download` attribute on <a />
        const link = document.createElement('a');
        link.style.display = 'none';

        const downloadUrl = window.URL.createObjectURL(fullBlob);
        link.href = downloadUrl;
        link.download = 'media.mkv';

        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    recorder.start();

    return true;
};

/**
 * Goes through DOM tree of given HTMLElement and removes specific tags
 * @param {HTMLElement} htmlElement
 * @param {String[]} tags
 * @return {integer} - number of elements removed
 *
 * @private
 */
SVGRender.prototype.filterOut = function (htmlElement, tags, lvl) {
    var ret = 0;
    var lvlString = "";
    for (var i = 0; i < lvl; i++) {
        lvlString += " ";
    }
    for (var i = 0; i < htmlElement.childNodes.length; i++) {
        if (tags.indexOf(htmlElement.childNodes[i].tagName) >= 0) {
            htmlElement.removeChild(htmlElement.childNodes[i]);
            ret++;
            i = -1;
        } else {
            //call filterOut recursively
            ret += this.filterOut(htmlElement.childNodes[i], tags, lvl + 1);
        }
    }
    return ret;
};

/**
 * Render next frame and schedule next run of render next frame
 * @returns {undefined}
 * @private
 */
SVGRender.prototype.renderNextFrame = function () {
    if (!this.svgElement) {
        throw "Cannot render - no svgElement loaded!";
    }

    if (this.interrupted) {
        //rendering was stopped
        //(this.nextFrame timeout should have been removed already!)
        throw "this.nextFrame timeout should have been removed already!";
        return;
    }


    this.SVGtime = this.beginMS + Math.round(1000 * this.imagesDoneCount) / (this.FPS);
    this.svgElement.pauseAnimations();
    this.svgElement.setCurrentTime(this.SVGtime / 1000);

    //Do deep copy of svgElement!
    //Clone element at t=0
    var svgElementNew = this.svgElement.cloneNode(true);


    //maybe unnescessary
    svgElementNew.pauseAnimations();

    //Copy styles
    this.filterOut(svgElementNew, ["animate", "animateTransform", "animateColor", "animateMotion", "animateColor"], 0);
    this.additionalData = this.exportStyle(this.svgElement, ["animate", "animateTransform", "animateColor", "animateMotion", "animateColor"]);

    this.importStyle(svgElementNew, this.additionalData);
    var svgString = (new XMLSerializer()).serializeToString(svgElementNew);

    this.svgImage = new Image();
    this.svgImage.onload = function () {

        tmpCanvasx = this.canvas.getContext('2d');
        if (this.canvas.width !== this.svgImage.width)
            this.canvas.width = this.svgImage.width;
        if (this.canvas.height !== this.svgImage.height)
            this.canvas.height = this.svgImage.height;
        tmpCanvasx.drawImage(this.svgImage, 0, 0);
        //image now in tmpCanvas

        //signalize progress
        if (this.progressSignal && typeof this.progressSignal === "function") {
            this.progressSignal(this.imagesDoneCount, this.imagesCount);
        }

        this.images[this.imagesDoneCount++] = this.canvas.toDataURL("image/png").replace(/^data:.+\/(.+);base64,/, "");
        if (this.imagesDoneCount <= this.imagesCount) {
            this.nextFrame = setTimeout(this.renderNextFrame.bind(this), 0);
        } else {
            this.finished = true;
            recorder.stop();
        }
    }.bind(this);

    //firefox inserts local URL into ids
    //fixing this behavior by replacing all appearances
    var docURL = window.location.href.split("#")[0];
    svgString = svgString.split(docURL + "#").join("#");

    this.svgImage.src = "data:image/svg+xml;base64," + btoa("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?>\n\
        <!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">" + unescape(encodeURIComponent(svgString)));
};
/**
 * Pause rendering
 * @returns {undefined}
 */
SVGRender.prototype.pause = function () {
    this.interrupted = true;
    clearTimeout(this.nextFrame);
    this.nextFrame = null;
};
/**
 * Resumes rendering
 * @returns {undefined}
 */
SVGRender.prototype.resume = function () {
    if (this.finished || !this.interrupted) {
        //not needed
        return;
    }

    this.interrupted = false;
    if (!this.nextFrame) {
        //next frame is not scheduled
        this.nextFrame = setTimeout(this.renderNextFrame.bind(this), 0);
    }
};
//copy style: http://stackoverflow.com/questions/2087778/javascript-copy-style
//also copy out transformMatrix
SVGRender.prototype.exportStyle = function (el, ignored) {
    var ret = {};
    ret.children = [];
    for (var i = 0; i < el.children.length; i++) {
        if (ignored.indexOf(el.children[i].tagName) >= 0) {
            //this is ignored tag
        } else {
            ret.children.push(this.exportStyle(el.children[i], ignored));
        }
    }

    var transformAnim = el.getTransformAnim();
    if (transformAnim) {
        ret.transformAnim = transformAnim;
    }


    if (el.getCTM && typeof (el.getCTM) === "function" && el.parentNode && el.parentNode.getCTM && typeof (el.parentNode.getCTM) === "function") {
        if (el.parentNode.getCTM()) {
            ret.ctm = el.parentNode.getCTM().inverse().multiply(el.getCTM());
        }
    }

    ret.value = [];
    var styles = window.getComputedStyle(el);
    for (var i = styles.length; i-- > 0; ) {
        var name = styles[i];
        if (!name.match(/^height$/) && !name.match(/^width$/) && !name.match(/^visibility/)) {
            ret.value.push({
                "name": name,
                "value": styles.getPropertyValue(name),
                "priority": styles.getPropertyPriority(name)
            });
        }
    }
    return ret;
};

SVGRender.prototype.importStyle = function (el, data) {
    if (!data) {
        return;
    }

    var matrix = this.svgElement.createSVGMatrix();

    if (data.ctm !== undefined) {
        matrix = matrix.multiply(data.ctm);
    }

    if (data.transform !== undefined) {
        matrix = matrix.multiply(data.transform);
    }


    el.setAttribute('transform', matrix.getReadable());

    for (var i = 0; i < el.children.length; i++) {
        //recursive
        this.importStyle(el.children[i], data.children[i]);
    }

    for (var n = 0; n < data.value.length; n++) {
        el.style.setProperty(data.value[n].name,
            data.value[n].value,
            data.value[n].priority
        );
    }
};
/**
 * Deep-copy element (recursive)
 * @param {Array|String|Number|Boolean|Object} src
 * @returns {Array|String|Number|Boolean|Object}
 */
SVGRender.prototype.deepCopy = function (src) {
    var dst;
    if (Array.isArray(src)) {
        dst = [];
        for (var i = 0; i < src.length; i++) {
            dst[i] = this.deepCopy(src[i]);
        }
    } else if (typeof (src) === "string" || typeof (src) === "number" || typeof (src) === "boolean") {
        return src;
    } else if (typeof (src) === "function") {
        return null;
    } else if (typeof (src) === "object") {
        dst = {};
        for (var at in src) {
            dst[at] = this.deepCopy(src[at]);
        }
    } else {
        throw "deepCopy unknown ";
    }

    return dst;
};
/**
 * Is render in progress?
 * @returns {undefined}
 */
SVGRender.prototype.isActive = function () {
    return !(this.finished);
};

/**
 * Get last error message string
 * @public
 * @returns {String}
 */
SVGRender.prototype.getErrorMessage = function () {
    return this.errMessage;
};

SVGElement.prototype.getTransformAnim = function () {
    var matrix = document.createElementNS("http://www.w3.org/2000/svg", "svg").createSVGMatrix();
    if (!this.transform || !this.transform.animVal) {
        return matrix;
    }
    for (var i = 0; i < this.transform.animVal.length; i++) {
        matrix = matrix.multiply(this.transform.animVal[i].matrix);
    }
    return matrix;
};
SVGMatrix.prototype.getReadable = function () {
    return "matrix(" + this.a + " " + this.b + " " + this.c + " " + this.d + " " + this.e + " " + this.f + ")";
};
