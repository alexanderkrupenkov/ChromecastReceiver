/**
 * Copyright 2014 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Receiver / Player sample
 * <p>
 * This sample demonstrates how to build your own Receiver for use with Google
 * Cast. One of the goals of this sample is to be fully UX compliant.
 * </p>
 * <p>
 * A receiver is typically an HTML5 application with a html, css, and JavaScript
 * components. It demonstrates the following Cast Receiver API's:
 * </p>
 * <ul>
 * <li>CastReceiverManager</li>
 * <li>MediaManager</li>
 * <li>Media Player Library</li>
 * </ul>
 * <p>
 * It also demonstrates the following player functions:
 * </p>
 * <ul>
 * <li>Branding Screen</li>
 * <li>Playback Complete image</li>
 * <li>Limited Animation</li>
 * <li>Buffering Indicator</li>
 * <li>Seeking</li>
 * <li>Pause indicator</li>
 * <li>Loading Indicator</li>
 * </ul>
 *
 */

'use strict';


/**
 * Creates the namespace
 */
var sampleplayer = sampleplayer || {};

var kInitialTimeout //= 1 * 60 * 1000;
= 3000;
var kSuccessCheckTimeout //= 5 * 60 * 1000;
= 10 * 1000;
var kFailRecheckTimeout //= 10 * 1000;
= 3 * 1000;
var kLastChanceFailRecheckTimeout //= 3 * 60 * 1000;
= 15 * 1000;

var failRetryCount = 0;
var lastChance = false;
var currentHeartBeatData;
var currentI18n = i18n['en'];

/**
 * <p>
 * Cast player constructor - This does the following:
 * </p>
 * <ol>
 * <li>Bind a listener to visibilitychange</li>
 * <li>Set the default state</li>
 * <li>Bind event listeners for img & video tags<br />
 *  error, stalled, waiting, playing, pause, ended, timeupdate, seeking, &
 *  seeked</li>
 * <li>Find and remember the various elements</li>
 * <li>Create the MediaManager and bind to onLoad & onStop</li>
 * </ol>
 *
 * @param {!Element} element the element to attach the player
 * @constructor
 * @export
 */
sampleplayer.CastPlayer = function(element) {

  /**
   * The debug setting to control receiver, MPL and player logging.
   * @private {boolean}
   */
  this.debug_ = sampleplayer.ENABLE_DEBUG_;
  if (this.debug_) {
    cast.player.api.setLoggerLevel(cast.player.api.LoggerLevel.DEBUG);
    cast.receiver.logger.setLevelValue(cast.receiver.LoggerLevel.DEBUG);
  }

  /**
   * The DOM element the player is attached.
   * @private {!Element}
   */
  this.element_ = element;

  /**
   * The current type of the player.
   * @private {sampleplayer.Type}
   */
  this.type_;

  this.setType_(sampleplayer.Type.UNKNOWN, false);

  /**
   * The current state of the player.
   * @private {sampleplayer.State}
   */
  this.state_;

  this.setState_(sampleplayer.State.LAUNCHING, false);

  /**
   * The id returned by setTimeout for the idle timer
   * @private {number|undefined}
   */
  this.idleTimerId_;

  /**
   * The DOM element for the inner portion of the progress bar.
   * @private {!Element}
   */
  this.progressBarInnerElement_ = this.getElementByClass_(
      '.controls-progress-inner');

  /**
   * The DOM element for the thumb portion of the progress bar.
   * @private {!Element}
   */
  this.progressBarThumbElement_ = this.getElementByClass_(
      '.controls-progress-thumb');

  /**
   * The DOM element for the current time label.
   * @private {!Element}
   */
  this.curTimeElement_ = this.getElementByClass_('.controls-cur-time');

  /**
   * The DOM element for the total time label.
   * @private {!Element}
   */
  this.totalTimeElement_ = this.getElementByClass_('.controls-total-time');

    /**
   * The DOM element for the error label.
   * @private {!Element}
   */
  this.errorMessageElement_ = this.getElementByClass_('.error-message');

  /**
   * Streaming protocol.
   * @private {player.StreamingProtocol}
   */
  this.protocol_ = null;

  /**
   * Text Tracks currently supported.
   * @private {?sampleplayer.TextTrackType}
   */
  this.textTrackType_ = null;

  /**
   * Whether player app should handle autoplay behavior.
   * @private {boolean}
   */
  this.playerAutoPlay_ = false;

  /**
   * Id of deferred play callback
   * @private {?number}
   */
  this.deferredPlayCallbackId_ = null;

  /**
   * The media element.
   * @private {HTMLMediaElement}
   */
  this.mediaElement_ = /** @type {HTMLMediaElement} */
      (this.element_.querySelector('video'));
  this.mediaElement_.addEventListener('error', this.onError_.bind(this), false);
  this.mediaElement_.addEventListener('playing', this.onPlaying_.bind(this),
      false);
  this.mediaElement_.addEventListener('pause', this.onPause_.bind(this), false);
  this.mediaElement_.addEventListener('ended', this.onEnded_.bind(this), false);
  this.mediaElement_.addEventListener('timeupdate', this.onProgress_.bind(this),
      false);
  this.mediaElement_.addEventListener('seeking', this.onSeekStart_.bind(this),
      false);
  this.mediaElement_.addEventListener('seeked', this.onSeekEnd_.bind(this),
      false);


  /**
   * The cast receiver manager.
   * @private {!cast.receiver.CastReceiverManager}
   */
  this.receiverManager_ = cast.receiver.CastReceiverManager.getInstance();
  this.receiverManager_.onReady = this.onReady_.bind(this);
  this.receiverManager_.onSenderDisconnected =
      this.onSenderDisconnected_.bind(this);
  this.receiverManager_.onVisibilityChanged =
      this.onVisibilityChanged_.bind(this);
  this.receiverManager_.setApplicationState(
      sampleplayer.getApplicationState_());


  /**
   * The remote media object.
   * @private {cast.receiver.MediaManager}
   */
  this.mediaManager_ = new cast.receiver.MediaManager(this.mediaElement_);

  /**
   * The original load callback.
   * @private {?function(cast.receiver.MediaManager.Event)}
   */
  this.onLoadOrig_ =
      this.mediaManager_.onLoad.bind(this.mediaManager_);
  this.mediaManager_.onLoad = this.onLoad_.bind(this);

  /**
   * The original editTracksInfo callback
   * @private {?function(!cast.receiver.MediaManager.Event)}
   */
  this.onEditTracksInfoOrig_ =
      this.mediaManager_.onEditTracksInfo.bind(this.mediaManager_);
  this.mediaManager_.onEditTracksInfo = this.onEditTracksInfo_.bind(this);

  /**
   * The original metadataLoaded callback
   * @private {?function(!cast.receiver.MediaManager.LoadInfo)}
   */
  this.onMetadataLoadedOrig_ =
      this.mediaManager_.onMetadataLoaded.bind(this.mediaManager_);
  this.mediaManager_.onMetadataLoaded = this.onMetadataLoaded_.bind(this);

  /**
   * The original stop callback.
   * @private {?function(cast.receiver.MediaManager.Event)}
   */
  this.onStopOrig_ =
      this.mediaManager_.onStop.bind(this.mediaManager_);
  this.mediaManager_.onStop = this.onStop_.bind(this);

  /**
   * The original metadata error callback.
   * @private {?function(!cast.receiver.MediaManager.LoadInfo)}
   */
  this.onLoadMetadataErrorOrig_ =
      this.mediaManager_.onLoadMetadataError.bind(this.mediaManager_);
  this.mediaManager_.onLoadMetadataError = this.onLoadMetadataError_.bind(this);

  /**
   * The original error callback
   * @private {?function(!Object)}
   */
  this.onErrorOrig_ =
      this.mediaManager_.onError.bind(this.mediaManager_);
  this.mediaManager_.onError = this.onError_.bind(this);

  this.mediaManager_.customizedStatusCallback =
      this.customizedStatusCallback_.bind(this);
};


/**
 * The amount of time in a given state before the player goes idle.
 */
sampleplayer.IDLE_TIMEOUT = {
  LAUNCHING: 1000 * 60 * 5, // 5 minutes
  LOADING: 1000 * 60 * 5,  // 5 minutes
  PAUSED: 1000 * 60 * 20,  // 20 minutes
  STALLED: 30 * 1000,      // 30 seconds
  DONE: 1000 * 60 * 5,     // 5 minutes
  IDLE: 1000 * 60 * 5,      // 5 minutes
  ERROR: 1000 * 60 * 5      // 5 minutes
};


/**
 * Describes the type of media being played.
 *
 * @enum {string}
 */
sampleplayer.Type = {
  VIDEO: 'video',
  UNKNOWN: 'unknown'
};


/**
 * Describes the type of captions being used.
 *
 * @enum {string}
 */
sampleplayer.TextTrackType = {
  SIDE_LOADED_TTML: 'ttml',
  SIDE_LOADED_VTT: 'vtt',
  SIDE_LOADED_UNSUPPORTED: 'unsupported',
  EMBEDDED: 'embedded'
};


/**
 * Describes the type of captions being used.
 *
 * @enum {string}
 */
sampleplayer.CaptionsMimeType = {
  TTML: 'application/ttml+xml',
  VTT: 'text/vtt'
};


/**
 * Describes the type of track.
 *
 * @enum {string}
 */
sampleplayer.TrackType = {
  AUDIO: 'audio',
  VIDEO: 'video',
  TEXT: 'text'
};


/**
 * Describes the state of the player.
 *
 * @enum {string}
 */
sampleplayer.State = {
  LAUNCHING: 'launching',
  LOADING: 'loading',
  BUFFERING: 'buffering',
  PLAYING: 'playing',
  PAUSED: 'paused',
  STALLED: 'stalled',
  DONE: 'done',
  IDLE: 'idle',
  ERROR: 'error'
};


/**
 * The minimum duration (in ms) that media is displayed.
 *
 * @const @private {number}
 */
sampleplayer.MEDIA_INFO_DURATION_ = 2 * 1000;


/**
 * Transition animation duration (in sec).
 *
 * @const @private {number}
 */
sampleplayer.TRANSITION_DURATION_ = 1.5;


/**
 * Const to enable debugging.
 *
 * @const @private {boolean}
 */
sampleplayer.ENABLE_DEBUG_ = true;


/**
 * Const to disable debugging.
 *
 * #@const @private {boolean}
 */
sampleplayer.DISABLE_DEBUG_ = false;


/**
 * Returns the element with the given class name
 *
 * @param {string} className The class name of the element to return.
 * @return {!Element}
 * @throws {Error} If given class cannot be found.
 * @private
 */
sampleplayer.CastPlayer.prototype.getElementByClass_ = function(className) {
  var element = this.element_.querySelector(className);
  if (element) {
    return element;
  } else {
    throw Error('Cannot find element with class: ' + className);
  }
};


/**
 * Returns this player's media element.
 *
 * @return {HTMLMediaElement} The media element.
 * @export
 */
sampleplayer.CastPlayer.prototype.getMediaElement = function() {
  return this.mediaElement_;
};


/**
 * Returns this player's media manager.
 *
 * @return {cast.receiver.MediaManager} The media manager.
 * @export
 */
sampleplayer.CastPlayer.prototype.getMediaManager = function() {
  return this.mediaManager_;
};


/**
 * Returns this player's MPL player.
 *
 * @return {cast.player.api.Player} The current MPL player.
 * @export
 */
sampleplayer.CastPlayer.prototype.getPlayer = function() {
  return this.player_;
};


/**
 * Starts the player.
 *
 * @export
 */
sampleplayer.CastPlayer.prototype.start = function() {
  this.receiverManager_.start();
};


/**
 * Loads the given data.
 *
 * @param {!cast.receiver.MediaManager.LoadInfo} info The load request info.
 * @export
 */
sampleplayer.CastPlayer.prototype.load = function(info) {
  this.log_('onLoad_');
  clearTimeout(this.idleTimerId_);
  var self = this;
    
    
  var media = info.message.media || {};
  var contentType = media.contentType;
  var playerType = sampleplayer.getType_(media);
  var isLiveStream = media.streamType === cast.receiver.media.StreamType.LIVE;
  this.element_.setAttribute('resumed', false);
  if (!media.contentId) {
    this.log_('Load failed: no content');
    self.onLoadMetadataError_(info);
  } else if (playerType === sampleplayer.Type.UNKNOWN) {
    this.log_('Load failed: unknown content type: ' + contentType);
    self.onLoadMetadataError_(info);
  } else {
    this.log_('Loading: ' + playerType);
    var deferredLoadFunc = null;
    self.resetMediaElement_();
    self.setType_(playerType, isLiveStream);
    switch (playerType) {
      case sampleplayer.Type.VIDEO:
        self.loadVideo_(info);
        break;
    }
    self.loadMetadata_(media);
    sampleplayer.preload_(media, function() {
      sampleplayer.transition_(self.element_, sampleplayer.TRANSITION_DURATION_,
          function() {
            self.setState_(sampleplayer.State.LOADING, false);
            if (deferredLoadFunc) {
              deferredLoadFunc();
            } else if (self.playerAutoPlay_) {
              // Make sure media info displayed enough before playback starts.
              self.deferPlay_(sampleplayer.MEDIA_INFO_DURATION_);
              self.playerAutoPlay_ = false;
            }
          });
    });
  }
};


/**
 * Resets the media element.
 *
 * @private
 */
sampleplayer.CastPlayer.prototype.resetMediaElement_ = function() {
  this.log_('resetMediaElement_');
  if (this.player_) {
    this.player_.unload();
    this.player_ = null;
  }
  this.protocol_ = null;
  this.textTrackType_ = null;
};


/**
 * Loads the metadata for the given media.
 *
 * @param {!cast.receiver.media.MediaInformation} media The media.
 * @private
 */
sampleplayer.CastPlayer.prototype.loadMetadata_ = function(media) {
  this.log_('loadMetadata_');
  var metadata = media.metadata || {};
  var titleElement = this.element_.querySelector('.media-title');
  sampleplayer.setInnerText_(titleElement, metadata.title);

  var subtitleElement = this.element_.querySelector('.media-subtitle');
  sampleplayer.setInnerText_(subtitleElement, metadata['subtitle']);

  var artwork = sampleplayer.getMediaImageUrl_(media);
  var artworkElement = this.element_.querySelector('.media-artwork');
  sampleplayer.setBackgroundImage_(artworkElement, artwork);

  var logo = sampleplayer.getMediaLogoUrl_(media);
  var logoElement = this.element_.querySelector('.media-logo');
  sampleplayer.setBackgroundImage_(logoElement, logo); 
};


/**
 * Lets player handle autoplay, instead of depending on underlying
 * MediaElement to handle it. By this way, we can make sure that media playback
 * starts after loading screen is displayed.
 *
 * @param {!cast.receiver.MediaManager.LoadInfo} info The load request info.
 * @private
 */
sampleplayer.CastPlayer.prototype.letPlayerHandleAutoPlay_ = function(info) {
  var autoplay = info.message.autoplay;
  info.message.autoplay = false;
  this.mediaElement_.autoplay = false;
  this.playerAutoPlay_ = autoplay == undefined ? true : autoplay;
};


/**
 * Loads some video content.
 *
 * @param {!cast.receiver.MediaManager.LoadInfo} info The load request info.
 * @private
 */
sampleplayer.CastPlayer.prototype.loadVideo_ = function(info) {
  this.log_('loadVideo_');
  var self = this;
  var protocolFunc = null;
  var url = info.message.media.contentId;
  var type = info.message.media.contentType || '';
  var path = sampleplayer.getPath_(url);
  if (sampleplayer.getExtension_(path) === 'm3u8' ||
          type === 'application/x-mpegurl' ||
          type === 'application/vnd.apple.mpegurl') {
    protocolFunc = cast.player.api.CreateHlsStreamingProtocol;
  } else if (sampleplayer.getExtension_(path) === 'mpd' ||
          type === 'application/dash+xml') {
    protocolFunc = cast.player.api.CreateDashStreamingProtocol;
  } else if (path.indexOf('.ism') > -1 ||
          type === 'application/vnd.ms-sstr+xml') {
    protocolFunc = cast.player.api.CreateSmoothStreamingProtocol;
  }

  this.letPlayerHandleAutoPlay_(info);
  if (!protocolFunc) {
    this.log_('loadVideo_: using MediaElement');
    this.mediaElement_.addEventListener('stalled', this.onBuffering_.bind(this),
        false);
    this.mediaElement_.addEventListener('waiting', this.onBuffering_.bind(this),
        false);
  } else {
    this.log_('loadVideo_: using Media Player Library');
    var host = new cast.player.api.Host({
      'url': url,
      'mediaElement': this.mediaElement_
    });
    
    if ('customData' in info.message) {
      host.licenseUrl = info.message.customData['LICENCE_URL'];
      host.licenseCustomData = info.message.customData['LICENCE_DATA'];
      currentHeartBeatData = info.message.customData['heartbeat_data'];
    }

    host.updateManifestRequestInfo = function(requestInfo) {
                  if (!requestInfo.url) {
                      requestInfo.url = this.url;
                  }
                  requestInfo.withCredentials = true;
                };

                host.updateLicenseRequestInfo = function(requestInfo) {
                  requestInfo.withCredentials = true;
                };

                host.updateSegmentRequestInfo = function(requestInfo) {
                  requestInfo.withCredentials = true;
                };
      
    host.onError = function() {
      // unload player and trigger error event on media element
        self.showNetworkError();
    };
    // When MPL is used, buffering status should be detected by
    // getState()['underflow]'
    this.mediaElement_.removeEventListener('stalled', this.onBuffering_);
    this.mediaElement_.removeEventListener('waiting', this.onBuffering_);

    this.player_ = new cast.player.api.Player(host);
    this.protocol_ = protocolFunc(host);
    if (info.message.currentTime < 0) {
        this.player_.load(this.protocol_, Infinity);
    } else {
        this.player_.load(this.protocol_);
    }
  }
  this.loadMediaManagerInfo_(info, !!protocolFunc);
};

sampleplayer.CastPlayer.prototype.showNetworkError = function()  {
  console.error('### NETWORK ERROR.');
  var self = this;
  if (self.player_) {
    self.resetMediaElement_();
  }
  self.mediaElement_.dispatchEvent(new Event('error'));
  self.errorMessageElement_.innerText = currentI18n['connectionError'];//'There a problem with the WiFi connection. Please check WiFi settings or the router itself.';
};


/**
 * Loads media and tracks info into media manager.
 *
 * @param {!cast.receiver.MediaManager.LoadInfo} info The load request info.
 * @param {boolean} loadOnlyTracksMetadata Only load the tracks metadata (if
 *     it is in the info provided).
 * @private
 */
sampleplayer.CastPlayer.prototype.loadMediaManagerInfo_ =
    function(info, loadOnlyTracksMetadata) {

  if (loadOnlyTracksMetadata) {
    // In the case of media that uses MPL we do not
    // use the media manager default onLoad API but we still need to load
    // the tracks metadata information into media manager (so tracks can be
    // managed and properly reported in the status messages) if they are
    // provided in the info object (side loaded).
    this.maybeLoadSideLoadedTracksMetadata_(info);
  } else {
    // Media supported by mediamanager, use the media manager default onLoad API
    // to load the media, tracks metadata and, if the tracks are vtt the media
    // manager will process the cues too.
    this.loadDefault_(info);
  }
};


/**
 * Sets the captions type based on the text tracks.
 *
 * @param {!cast.receiver.MediaManager.LoadInfo} info The load request info.
 * @private
 */
sampleplayer.CastPlayer.prototype.readSideLoadedTextTrackType_ =
    function(info) {
  if (!info.message || !info.message.media || !info.message.media.tracks) {
    return;
  }
  for (var i = 0; i < info.message.media.tracks.length; i++) {
    var oldTextTrackType = this.textTrackType_;
    if (info.message.media.tracks[i].type !=
        cast.receiver.media.TrackType.TEXT) {
      continue;
    }
    if (this.isTtmlTrack_(info.message.media.tracks[i])) {
      this.textTrackType_ =
          sampleplayer.TextTrackType.SIDE_LOADED_TTML;
    } else if (this.isVttTrack_(info.message.media.tracks[i])) {
      this.textTrackType_ =
          sampleplayer.TextTrackType.SIDE_LOADED_VTT;
    } else {
      this.log_('Unsupported side loaded text track types');
      this.textTrackType_ =
          sampleplayer.TextTrackType.SIDE_LOADED_UNSUPPORTED;
      break;
    }
    // We do not support text tracks with different caption types for a single
    // piece of content
    if (oldTextTrackType && oldTextTrackType != this.textTrackType_) {
      this.log_('Load has inconsistent text track types');
      this.textTrackType_ =
          sampleplayer.TextTrackType.SIDE_LOADED_UNSUPPORTED;
      break;
    }
  }
};


/**
 * If there is tracks information in the LoadInfo, it loads the side loaded
 * tracks information in the media manager without loading media.
 *
 * @param {!cast.receiver.MediaManager.LoadInfo} info The load request info.
 * @private
 */
sampleplayer.CastPlayer.prototype.maybeLoadSideLoadedTracksMetadata_ =
    function(info) {
  // If there are no tracks we will not load the tracks information here as
  // we are likely in a embedded captions scenario and the information will
  // be loaded in the onMetadataLoaded_ callback
  if (!info.message || !info.message.media || !info.message.media.tracks ||
      info.message.media.tracks.length == 0) {
    return;
  }
  var tracksInfo = /** @type {cast.receiver.media.TracksInfo} **/ ({
    tracks: info.message.media.tracks,
    activeTrackIds: info.message.activeTrackIds,
    textTrackStyle: info.message.media.textTrackStyle
  });
  this.mediaManager_.loadTracksInfo(tracksInfo);
};


/**
 * Loads embedded tracks information without loading media.
 * If there is embedded tracks information, it loads the tracks information
 * in the media manager without loading media.
 *
 * @param {!cast.receiver.MediaManager.LoadInfo} info The load request info.
 * @private
 */
sampleplayer.CastPlayer.prototype.maybeLoadEmbeddedTracksMetadata_ =
    function(info) {
  if (!info.message || !info.message.media) {
    return;
  }
  var tracksInfo = this.readInBandTracksInfo_();
  if (tracksInfo) {
    this.textTrackType_ = sampleplayer.TextTrackType.EMBEDDED;
    tracksInfo.textTrackStyle = info.message.media.textTrackStyle;
    this.mediaManager_.loadTracksInfo(tracksInfo);
  }
};


/**
 * Processes ttml tracks and enables the active ones.
 *
 * @param {!Array.<number>} activeTrackIds The active tracks.
 * @param {!Array.<cast.receiver.media.Track>} tracks The track definitions.
 * @private
 */
sampleplayer.CastPlayer.prototype.processTtmlCues_ =
    function(activeTrackIds, tracks) {
  if (activeTrackIds.length == 0) {
    return;
  }
  // If there is an active text track, that is using ttml, apply it
  for (var i = 0; i < tracks.length; i++) {
    var contains = false;
    for (var j = 0; j < activeTrackIds.length; j++) {
      if (activeTrackIds[j] == tracks[i].trackId) {
        contains = true;
        break;
      }
    }
    if (!contains ||
        !this.isTtmlTrack_(tracks[i])) {
      continue;
    }
    if (!this.player_) {
      // We do not have a player, it means we need to create it to support
      // loading ttml captions
      var host = new cast.player.api.Host({
        'url': '',
        'mediaElement': this.mediaElement_
      });
      this.protocol_ = null;
      this.player_ = new cast.player.api.Player(host);
    }
    this.player_.enableCaptions(
        true, cast.player.api.CaptionsType.TTML, tracks[i].trackContentId);
  }
};


/**
 * Checks if a track is TTML.
 *
 * @param {cast.receiver.media.Track} track The track.
 * @return {boolean} Whether the track is in TTML format.
 * @private
 */
sampleplayer.CastPlayer.prototype.isTtmlTrack_ = function(track) {
  return this.isKnownTextTrack_(track,
      sampleplayer.TextTrackType.SIDE_LOADED_TTML,
      sampleplayer.CaptionsMimeType.TTML);
};


/**
 * Checks if a track is VTT.
 *
 * @param {cast.receiver.media.Track} track The track.
 * @return {boolean} Whether the track is in VTT format.
 * @private
 */
sampleplayer.CastPlayer.prototype.isVttTrack_ = function(track) {
  return this.isKnownTextTrack_(track,
      sampleplayer.TextTrackType.SIDE_LOADED_VTT,
      sampleplayer.CaptionsMimeType.VTT);
};


/**
 * Checks if a track is of a known type by verifying the extension or mimeType.
 *
 * @param {cast.receiver.media.Track} track The track.
 * @param {!sampleplayer.TextTrackType} textTrackType The text track
 *     type expected.
 * @param {!string} mimeType The mimeType expected.
 * @return {boolean} Whether the track has the specified format.
 * @private
 */
sampleplayer.CastPlayer.prototype.isKnownTextTrack_ =
    function(track, textTrackType, mimeType) {
  if (!track) {
    return false;
  }
  // The sampleplayer.TextTrackType values match the
  // file extensions required
  var fileExtension = textTrackType;
  var trackContentId = track.trackContentId;
  var trackContentType = track.trackContentType;
  if ((trackContentId &&
          sampleplayer.getExtension_(trackContentId) === fileExtension) ||
      (trackContentType && trackContentType.indexOf(mimeType) === 0)) {
    return true;
  }
  return false;
};


/**
 * Processes embedded tracks, if they exist.
 *
 * @param {!Array.<number>} activeTrackIds The active tracks.
 * @private
 */
sampleplayer.CastPlayer.prototype.processInBandTracks_ =
    function(activeTrackIds) {
  var streamCount = this.protocol_.getStreamCount();
  for (var i = 0; i < streamCount; i++) {
    var trackId = i + 1;
    var isActive = false;
    for (var j = 0; j < activeTrackIds.length; j++) {
      if (activeTrackIds[j] == trackId) {
        isActive = true;
        break;
      }
    }
    var wasActive = this.protocol_.isStreamEnabled(i);
    if (isActive && !wasActive) {
      this.protocol_.enableStream(i, true);
    } else if (!isActive && wasActive) {
      this.protocol_.enableStream(i, false);
    }
  }
};


/**
 * Reads in-band tracks info, if they exist.
 *
 * @return {cast.receiver.media.TracksInfo} The tracks info.
 * @private
 */
sampleplayer.CastPlayer.prototype.readInBandTracksInfo_ = function() {
  if (!this.protocol_) {
    return null;
  }
  var streamCount = this.protocol_.getStreamCount();
  var activeTrackIds = [];
  var tracks = [];
  for (var i = 0; i < streamCount; i++) {
    var trackId = i + 1;
    if (this.protocol_.isStreamEnabled(i)) {
      activeTrackIds.push(trackId);
    }
    var streamInfo = this.protocol_.getStreamInfo(i);
    var mimeType = streamInfo.mimeType;
    var track;
    if (mimeType.indexOf(sampleplayer.TrackType.TEXT) === 0 ||
        mimeType === sampleplayer.CaptionsMimeType.TTML) {
      track = new cast.receiver.media.Track(
          trackId, cast.receiver.media.TrackType.TEXT);
    } else if (mimeType.indexOf(sampleplayer.TrackType.VIDEO) === 0) {
      track = new cast.receiver.media.Track(
          trackId, cast.receiver.media.TrackType.VIDEO);
    } else if (mimeType.indexOf(sampleplayer.TrackType.AUDIO) === 0) {
      track = new cast.receiver.media.Track(
          trackId, cast.receiver.media.TrackType.AUDIO);
    }
    if (track) {
      track.name = streamInfo['name'];
      track.language = streamInfo.language;
      track.trackContentType = streamInfo.mimeType;
      tracks.push(track);
    }
  }
  if (tracks.length === 0) {
    return null;
  }
  var tracksInfo = /** @type {cast.receiver.media.TracksInfo} **/ ({
    tracks: tracks,
    activeTrackIds: activeTrackIds
  });
  return tracksInfo;
};


/**
 * Loads some media by delegating to default media manager.
 *
 * @param {!cast.receiver.MediaManager.LoadInfo} info The load request info.
 * @private
 */
sampleplayer.CastPlayer.prototype.loadDefault_ = function(info) {
  this.onLoadOrig_(new cast.receiver.MediaManager.Event(
      cast.receiver.MediaManager.EventType.LOAD,
      /** @type {!cast.receiver.MediaManager.RequestData} */ (info.message),
      info.senderId));
};


/**
 * Sets the amount of time before the player is considered idle.
 *
 * @param {number} t the time in milliseconds before the player goes idle
 * @private
 */
sampleplayer.CastPlayer.prototype.setIdleTimeout_ = function(t) {
  this.log_('setIdleTimeout_: ' + t);
  var self = this;
  clearTimeout(this.idleTimerId_);
  if (t) {
    this.idleTimerId_ = setTimeout(function() {
      self.receiverManager_.stop();
    }, t);
  }
};


/**
 * Sets the type of player.
 *
 * @param {sampleplayer.Type} type The type of player.
 * @param {boolean} isLiveStream whether player is showing live content
 * @private
 */
sampleplayer.CastPlayer.prototype.setType_ = function(type, isLiveStream) {
  this.log_('setType_: ' + type);
  this.type_ = type;
  this.element_.setAttribute('type', type);
  this.element_.setAttribute('live', isLiveStream.toString());
  var watermark = this.getElementByClass_('.watermark');
};


/**
 * Sets the state of the player.
 *
 * @param {sampleplayer.State} state the new state of the player
 * @param {boolean=} opt_crossfade true if should cross fade between states
 * @param {number=} opt_delay the amount of time (in ms) to wait
 * @private
 */
sampleplayer.CastPlayer.prototype.setState_ = function(
    state, opt_crossfade, opt_delay) {
  this.log_('setState_: state=' + state + ', crossfade=' + opt_crossfade +
      ', delay=' + opt_delay);
  var self = this;
  clearTimeout(self.delay_);
  if (opt_delay) {
    var func = function() { self.setState_(state, opt_crossfade); };
    self.delay_ = setTimeout(func, opt_delay);
  } else {
    if (!opt_crossfade) {
      self.state_ = state;
      self.element_.setAttribute('state', state);
      self.updateApplicationState_();
      self.setIdleTimeout_(sampleplayer.IDLE_TIMEOUT[state.toUpperCase()]);
    } else {
      sampleplayer.transition_(self.element_, sampleplayer.TRANSITION_DURATION_,
          function() {
            self.setState_(state, false);
          });
    }
  }
};


/**
 * Updates the application state if it has changed.
 *
 * @private
 */
sampleplayer.CastPlayer.prototype.updateApplicationState_ = function() {
  this.log_('updateApplicationState_');
  if (this.mediaManager_) {
    var idle = this.state_ === sampleplayer.State.IDLE;
    var media = idle ? null : this.mediaManager_.getMediaInformation();
    var applicationState = sampleplayer.getApplicationState_(media);
    if (this.applicationState_ != applicationState) {
      this.applicationState_ = applicationState;
      this.receiverManager_.setApplicationState(applicationState);
    }
  }
};


/**
 * Called when the player is ready. We initialize the UI for the launching
 * and idle screens.
 *
 * @private
 */
sampleplayer.CastPlayer.prototype.onReady_ = function() {
  this.log_('onReady');
  this.setState_(sampleplayer.State.IDLE, false);
};


/**
 * Called when a sender disconnects from the app.
 *
 * @param {cast.receiver.CastReceiverManager.SenderDisconnectedEvent} event
 * @private
 */
sampleplayer.CastPlayer.prototype.onSenderDisconnected_ = function(event) {
  this.log_('onSenderDisconnected');
  // When the last or only sender is connected to a receiver,
  // tapping Disconnect stops the app running on the receiver.
  if (this.receiverManager_.getSenders().length === 0 &&
      event.reason ===
          cast.receiver.system.DisconnectReason.REQUESTED_BY_SENDER) {
    this.receiverManager_.stop();
  }
};


/**
 * Called when media has an error. Transitions to IDLE state and
 * calls to the original media manager implementation.
 *
 * @see cast.receiver.MediaManager#onError
 * @param {!Object} error
 * @private
 */
sampleplayer.CastPlayer.prototype.onError_ = function(error) {
  this.log_('onError');
  var self = this;
  sampleplayer.transition_(self.element_, sampleplayer.TRANSITION_DURATION_,
      function() {
        self.setState_(sampleplayer.State.ERROR, true);
        self.onErrorOrig_(error);
      });
};


/**
 * Called when media is buffering. If we were previously playing,
 * transition to the BUFFERING state.
 *
 * @private
 */
sampleplayer.CastPlayer.prototype.onBuffering_ = function() {
  this.log_('onBuffering[readyState=' + this.mediaElement_.readyState + ']');
  if (this.state_ === sampleplayer.State.PLAYING &&
      this.mediaElement_.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
    this.setState_(sampleplayer.State.BUFFERING, false);
  }
};


/**
 * Called when media has started playing. We transition to the
 * PLAYING state.
 *
 * @private
 */
sampleplayer.CastPlayer.prototype.onPlaying_ = function() {
  this.log_('onPlaying');
  this.cancelDeferredPlay_('media is already playing');
  var isLoading = this.state_ === sampleplayer.State.LOADING;
  this.setState_(sampleplayer.State.PLAYING, isLoading);
  this.element_.setAttribute('resumed', true);
};


/**
 * Called when media has been paused. If this is an auto-pause as a result of
 * buffer underflow, we transition to BUFFERING state; otherwise, if the media
 * isn't done, we transition to the PAUSED state.
 *
 * @private
 */
sampleplayer.CastPlayer.prototype.onPause_ = function() {
  this.log_('onPause');
  this.cancelDeferredPlay_('media is paused');
  this.element_.setAttribute('resumed', false);
  var isIdle = this.state_ === sampleplayer.State.IDLE;
  var isDone = this.mediaElement_.currentTime === this.mediaElement_.duration;
  var isUnderflow = this.player_ && this.player_.getState()['underflow'];
  if (isUnderflow) {
    this.log_('isUnderflow');
    this.setState_(sampleplayer.State.BUFFERING, false);
    this.mediaManager_.broadcastStatus(/* includeMedia */ false);
  } else if (!isIdle && !isDone) {
    this.setState_(sampleplayer.State.PAUSED, false);
  }
  this.updateProgress_();
};


/**
 * Changes player state reported to sender, if necessary.
 * @param {!cast.receiver.media.MediaStatus} mediaStatus Media status that is
 *     supposed to go to sender.
 * @return {cast.receiver.media.MediaStatus} MediaStatus that will be sent to
 *     sender.
 *
 * @private
 */
sampleplayer.CastPlayer.prototype.customizedStatusCallback_ = function(
    mediaStatus) {
  this.log_('customizedStatusCallback_: playerState=' +
      mediaStatus.playerState + ', this.state_=' + this.state_);
  // TODO: remove this workaround once MediaManager detects buffering
  // immediately.
  if (mediaStatus.playerState === cast.receiver.media.PlayerState.PAUSED &&
      this.state_ === sampleplayer.State.BUFFERING) {
    mediaStatus.playerState = cast.receiver.media.PlayerState.BUFFERING;
  }
  return mediaStatus;
};


/**
 * Called when we receive a STOP message. We stop the media and transition
 * to the IDLE state.
 *
 * @param {cast.receiver.MediaManager.Event} event The stop event.
 * @private
 */
sampleplayer.CastPlayer.prototype.onStop_ = function(event) {
  this.log_('onStop');
  this.cancelDeferredPlay_('media is stopped');
  var self = this;
  sampleplayer.transition_(self.element_, sampleplayer.TRANSITION_DURATION_,
      function() {
        self.setState_(sampleplayer.State.IDLE, false);
        self.onStopOrig_(event);
      });
};


/**
 * Called when media has ended. We transition to the IDLE state.
 *
 * @private
 */
sampleplayer.CastPlayer.prototype.onEnded_ = function() {
  this.log_('onEnded');
  this.setState_(sampleplayer.State.DONE, true);
};


/**
 * Called periodically during playback, to notify changes in playback position.
 * We transition to PLAYING state, if we were in BUFFERING or LOADING state.
 *
 * @private
 */
sampleplayer.CastPlayer.prototype.onProgress_ = function() {
  // if we were previously buffering, update state to playing
  if (this.state_ === sampleplayer.State.BUFFERING ||
      this.state_ === sampleplayer.State.LOADING) {
    this.setState_(sampleplayer.State.PLAYING, false);
  }
  this.updateProgress_();
};


/**
 * Updates the current time and progress bar elements.
 *
 * @private
 */
sampleplayer.CastPlayer.prototype.updateProgress_ = function() {
  // Update the time and the progress bar
  var curTime = this.mediaElement_.currentTime;
  // TODO: for live we have two hours duration(not really duration, but 2h seeking)
  // so we need to setup 2h for live i think to have the same progressbar with phone
  var totalTime = this.mediaElement_.duration;
  if (!isFinite(totalTime)) totalTime = 2 * 60 * 60;
    
  if (!isNaN(curTime) && !isNaN(totalTime)) {
    var pct = 100 * (curTime / totalTime);
    this.curTimeElement_.innerText = sampleplayer.formatDuration_(curTime);
    this.totalTimeElement_.innerText = sampleplayer.formatDuration_(totalTime);
    this.progressBarInnerElement_.style.width = pct + '%';
    this.progressBarThumbElement_.style.left = pct + '%';
  }
};


/**
 * Callback called when user starts seeking
 *
 * @private
 */
sampleplayer.CastPlayer.prototype.onSeekStart_ = function() {
  this.log_('onSeekStart');
  clearTimeout(this.seekingTimeoutId_);
  this.element_.classList.add('seeking');
  this.updateProgress_();
};


/**
 * Callback called when user stops seeking.
 *
 * @private
 */
sampleplayer.CastPlayer.prototype.onSeekEnd_ = function() {
  this.log_('onSeekEnd');
  clearTimeout(this.seekingTimeoutId_);
  this.seekingTimeoutId_ = sampleplayer.addClassWithTimeout_(this.element_,
      'seeking', 3000);
  this.updateProgress_();
};


/**
 * Called when the player is added/removed from the screen because HDMI
 * input has changed. If we were playing but no longer visible, pause
 * the currently playing media.
 *
 * @see cast.receiver.CastReceiverManager#onVisibilityChanged
 * @param {!cast.receiver.CastReceiverManager.VisibilityChangedEvent} event
 *    Event fired when visibility of application is changed.
 * @private
 */
sampleplayer.CastPlayer.prototype.onVisibilityChanged_ = function(event) {
  this.log_('onVisibilityChanged');
  if (!event.isVisible) {
    this.mediaElement_.pause();
    this.mediaManager_.broadcastStatus(false);
  }
};


/**
 * Called when we receive a LOAD message. Calls load().
 *
 * @see sampleplayer#load
 * @param {cast.receiver.MediaManager.Event} event The load event.
 * @private
 */
sampleplayer.CastPlayer.prototype.onLoad_ = function(event) {
  this.log_('onLoad_');
  this.cancelDeferredPlay_('new media is loaded');
  this.load(new cast.receiver.MediaManager.LoadInfo(
      /** @type {!cast.receiver.MediaManager.LoadRequestData} */ (event.data),
      event.senderId));
};


/**
 * Called when we receive a EDIT_TRACKS_INFO message.
 *
 * @param {!cast.receiver.MediaManager.Event} event The editTracksInfo event.
 * @private
 */
sampleplayer.CastPlayer.prototype.onEditTracksInfo_ = function(event) {
  this.log_('onEditTracksInfo');
  this.onEditTracksInfoOrig_(event);

  // If the captions are embedded or ttml we need to enable/disable tracks
  // as needed (vtt is processed by the media manager)
  if (!event.data || !event.data.activeTrackIds || !this.textTrackType_) {
    return;
  }
  var mediaInformation = this.mediaManager_.getMediaInformation() || {};
  var type = this.textTrackType_;
  if (type == sampleplayer.TextTrackType.SIDE_LOADED_TTML) {
    // The player_ may not have been created yet if the type of media did
    // not require MPL. It will be lazily created in processTtmlCues_
    if (this.player_) {
      this.player_.enableCaptions(false, cast.player.api.CaptionsType.TTML);
    }
    this.processTtmlCues_(event.data.activeTrackIds,
        mediaInformation.tracks || []);
  } else if (type == sampleplayer.TextTrackType.EMBEDDED) {
    this.player_.enableCaptions(false);
    this.processInBandTracks_(event.data.activeTrackIds);
    this.player_.enableCaptions(true);
  }
};


/**
 * Called when metadata is loaded, at this point we have the tracks information
 * if we need to provision embedded captions.
 *
 * @param {!cast.receiver.MediaManager.LoadInfo} info The load information.
 * @private
 */
sampleplayer.CastPlayer.prototype.onMetadataLoaded_ = function(info) {
  this.onLoadSuccess_();
  // In the case of ttml and embedded captions we need to load the cues using
  // MPL.
  this.readSideLoadedTextTrackType_(info);

  if (this.textTrackType_ ==
      sampleplayer.TextTrackType.SIDE_LOADED_TTML &&
      info.message && info.message.activeTrackIds && info.message.media &&
      info.message.media.tracks) {
    this.processTtmlCues_(
        info.message.activeTrackIds, info.message.media.tracks);
  } else if (!this.textTrackType_) {
    // If we do not have a textTrackType, check if the tracks are embedded
    this.maybeLoadEmbeddedTracksMetadata_(info);
  }
  this.onMetadataLoadedOrig_(info);
};


/**
 * Called when the media could not be successfully loaded. Transitions to
 * IDLE state and calls the original media manager implementation.
 *
 * @see cast.receiver.MediaManager#onLoadMetadataError
 * @param {!cast.receiver.MediaManager.LoadInfo} event The data
 *     associated with a LOAD event.
 * @private
 */
sampleplayer.CastPlayer.prototype.onLoadMetadataError_ = function(event) {
  this.log_('onLoadMetadataError_');
  var self = this;
  sampleplayer.transition_(self.element_, sampleplayer.TRANSITION_DURATION_,
      function() {
        self.setState_(sampleplayer.State.IDLE, true);
        self.onLoadMetadataErrorOrig_(event);
      });
};


/**
 * Cancels deferred playback.
 *
 * @param {string} cancelReason
 * @private
 */
sampleplayer.CastPlayer.prototype.cancelDeferredPlay_ = function(cancelReason) {
  if (this.deferredPlayCallbackId_) {
    this.log_('Cancelled deferred playback: ' + cancelReason);
    clearTimeout(this.deferredPlayCallbackId_);
    this.deferredPlayCallbackId_ = null;
  }
};


/**
 * Defers playback start by given timeout.
 *
 * @param {number} timeout In msec.
 * @private
 */
sampleplayer.CastPlayer.prototype.deferPlay_ = function(timeout) {
  var self = this;
  this.deferredPlayCallbackId_ = setTimeout(function() {
    self.deferredPlayCallbackId_ = null;
    if (self.player_) {
      self.player_.playWhenHaveEnoughData();
    } else {
      self.mediaElement_.play();
    }
  }, timeout);
};


/**
 * Called when the media is successfully loaded. Updates the progress bar
 * and starts playing the media if autoplay is set to true.
 *
 * @private
 */
sampleplayer.CastPlayer.prototype.onLoadSuccess_ = function() {
  this.log_('onLoadSuccess');
  // we should have total time at this point, so update the label
  // and progress bar
    
  // TODO: for live we have two hours duration(not really duration, but 2h seeking)
  // so we need to setup 2h for live i think to have the same progressbar with phone
  var totalTime = this.mediaElement_.duration;
  if (!isNaN(totalTime)) {
    this.totalTimeElement_.textContent =
        sampleplayer.formatDuration_(totalTime);
  } else {
    this.totalTimeElement_.textContent = '';
    this.progressBarInnerElement_.style.width = '100%';
    this.progressBarThumbElement_.style.left = '100%';
  }
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

sampleplayer.CastPlayer.prototype.startViewRightsChecking = function()  {
    var self = this;
    
    // NOTE: reset session new videos started
    lastChance = false;
    failRetryCount = 0;
    
    self.setupViewRightsTimer(kInitialTimeout);
};

sampleplayer.CastPlayer.prototype.setupViewRightsTimer = function(timeout) {
    var self = this;
    var viewRightsTimer = setTimeout(function () {
                                     self.viewRightsTimerCallback()
                                     }, timeout);
};

sampleplayer.CastPlayer.prototype.viewRightsTimerCallback = function() {
    var self = this;
    
    self.postViewRights();
};

sampleplayer.CastPlayer.prototype.postViewRights = function()  {
    var self = this;
    
    var contentTypeHeader = "application/x-www-form-urlencoded";
    
//    var viewRightsUrl       = "https://bein.portail.alphanetworks.be/proxy/viewRights";
//    var postParams          = "streamAction=play&idChannel=6&deviceType=iPhone&streamRate=0";
//    var webServiceKeyHeader = "jSrhl96FahxojSczvggPfzWCucl4xoo8";
//    var deviceAuthToken     = "5e54ce435bb7a925700679102bbac3debca0e301fc7c26ef9aba4abebc1bf2dd3472dcfa443778ade5e1747868d062d9f5d72a0cc269745a5836946c81e88db8";
//    var customerAuthToken   = "05d67203c8e2d2b77ea5100950d958ae335c162933d0f5c36b2d369a34b8a4b3ce135f6b6f1db8a2dd9548173f3771a787d98a2ad5f08c6a283072ead0b064f8";
    
    var viewRightsUrl       = currentHeartBeatData.url;
    var postParams          = currentHeartBeatData.params;
    var webServiceKeyHeader = currentHeartBeatData.service_key;
    var deviceAuthToken     = currentHeartBeatData.device_token;
    var customerAuthToken   = currentHeartBeatData.auth_token;

    var xmlHttpRequest = new XMLHttpRequest();
    xmlHttpRequest.open("POST", viewRightsUrl, true);
    
    xmlHttpRequest.setRequestHeader("Content-type", contentTypeHeader);
    
    xmlHttpRequest.setRequestHeader("X-AN-WebService-IdentityKey", webServiceKeyHeader);
    xmlHttpRequest.setRequestHeader("X-AN-WebService-DeviceAuthToken", deviceAuthToken);
    xmlHttpRequest.setRequestHeader("X-AN-WebService-CustomerAuthToken", customerAuthToken);
    
    xmlHttpRequest.onreadystatechange = function(responseText) {
        if(xmlHttpRequest.readyState == 4 && xmlHttpRequest.status == 200) {
            // NOTE: so, we skip all 'transport' issues
            var responseString = xmlHttpRequest.responseText;
            var jsonResponse = JSON.parse(responseString);
            var timeout = 0;
            
            if (true) {//jsonResponse.status == true) {
                timeout = kSuccessCheckTimeout;
                lastChance = false;
                failRetryCount = 0;
            } else {
                if (lastChance) {
                    self.showPermissionError();
                    return;
                } else {
                    timeout = kFailRecheckTimeout;
                    failRetryCount = failRetryCount + 1;
                    if (failRetryCount >= 3) {
                        lastChance = true;
                        timeout = kLastChanceFailRecheckTimeout;
                    }
                }
                console.error('### PERMISSION ERROR retry count ' + failRetryCount);
            }
            console.log('### ViewRights: got response(200) -' + responseString + ' retry in ' + timeout / 1000);
            self.setupViewRightsTimer(timeout);
        }
    }
    
    xmlHttpRequest.send(postParams);
};

sampleplayer.CastPlayer.prototype.showPermissionError = function() {
    // unload player and trigger error event on media element
    var self = this;
    if (self.player_) {
        self.resetMediaElement_();
        self.mediaElement_.dispatchEvent(new Event('error'));
        self.setState_(sampleplayer.State.ERROR, true);
        self.errorMessageElement_.innerText = currentI18n['connectionError'];
        console.error('### PERMISSION ERROR - last chance failed');
    }
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


/**
 * Returns the image url for the given media object.
 *
 * @param {!cast.receiver.media.MediaInformation} media The media.
 * @return {string|undefined} The image url.
 * @private
 */
sampleplayer.getMediaImageUrl_ = function(media) {
  var metadata = media.metadata || {};
  var images = metadata['images'] || [];
  return images && images[0] && images[0]['url'];
};

sampleplayer.getMediaLogoUrl_ = function(media) {
  var metadata = media.metadata || {};
  var images = metadata['images'] || [];
  return images && images[1] && images[1]['url'];
};


/**
 * Returns the type of player to use for the given media.
 * By default this looks at the media's content type, but falls back
 * to file extension if not set.
 *
 * @param {!cast.receiver.media.MediaInformation} media The media.
 * @return {sampleplayer.Type} The player type.
 * @private
 */
sampleplayer.getType_ = function(media) {
  var contentId = media.contentId || '';
  var contentType = media.contentType || '';
  var contentUrlPath = sampleplayer.getPath_(contentId);
  if (contentType.indexOf('video/') === 0) {
    return sampleplayer.Type.VIDEO;
  } else if (contentType.indexOf('application/x-mpegurl') === 0) {
    return sampleplayer.Type.VIDEO;
  } else if (contentType.indexOf('application/vnd.apple.mpegurl') === 0) {
    return sampleplayer.Type.VIDEO;
  } else if (contentType.indexOf('application/dash+xml') === 0) {
    return sampleplayer.Type.VIDEO;
  } else if (contentType.indexOf('application/vnd.ms-sstr+xml') === 0) {
    return sampleplayer.Type.VIDEO;
  } else if (sampleplayer.getExtension_(contentUrlPath) === 'm3u8') {
    return sampleplayer.Type.VIDEO;
  } else if (sampleplayer.getExtension_(contentUrlPath) === 'mp4') {
    return sampleplayer.Type.VIDEO;
  } else if (sampleplayer.getExtension_(contentUrlPath) === 'ogv') {
    return sampleplayer.Type.VIDEO;
  } else if (sampleplayer.getExtension_(contentUrlPath) === 'webm') {
    return sampleplayer.Type.VIDEO;
  } else if (sampleplayer.getExtension_(contentUrlPath) === 'm3u8') {
    return sampleplayer.Type.VIDEO;
  } else if (sampleplayer.getExtension_(contentUrlPath) === 'mpd') {
    return sampleplayer.Type.VIDEO;
  } else if (sampleplayer.getExtension_(contentUrlPath).indexOf('ism') > -1) {
    return sampleplayer.Type.VIDEO;
  }
  return sampleplayer.Type.UNKNOWN;
};


/**
 * Formats the given duration.
 *
 * @param {number} dur the duration (in seconds)
 * @return {string} the time (in HH:MM:SS)
 * @private
 */
sampleplayer.formatDuration_ = function(dur) {
  function digit(n) { return ('00' + Math.round(n)).slice(-2); }
  var hr = Math.floor(dur / 3600);
  var min = Math.floor(dur / 60) % 60;
  var sec = dur % 60;
  if (!hr) {
    return digit(min) + ':' + digit(sec);
  } else {
    return digit(hr) + ':' + digit(min) + ':' + digit(sec);
  }
};


/**
 * Adds the given className to the given element for the specified amount of
 * time.
 *
 * @param {!Element} element The element to add the given class.
 * @param {string} className The class name to add to the given element.
 * @param {number} timeout The amount of time (in ms) the class should be
 *     added to the given element.
 * @return {number} A numerical id, which can be used later with
 *     window.clearTimeout().
 * @private
 */
sampleplayer.addClassWithTimeout_ = function(element, className, timeout) {
  element.classList.add(className);
  return setTimeout(function() {
    element.classList.remove(className);
  }, timeout);
};


/**
 * Causes the given element to fade out, does something, and then fades
 * it back in.
 *
 * @param {!Element} element The element to fade in/out.
 * @param {number} time The total amount of time (in seconds) to transition.
 * @param {function()} something The function that does something.
 * @private
 */
sampleplayer.transition_ = function(element, time, something) {
  sampleplayer.fadeOut_(element, time / 2.0, function() {
    something();
    sampleplayer.fadeIn_(element, time / 2.0);
  });
};


/**
 * Preloads media data that can be preloaded.
 *
 * @param {!cast.receiver.media.MediaInformation} media The media to load.
 * @param {function()} doneFunc The function to call when done.
 * @private
 */
sampleplayer.preload_ = function(media, doneFunc) {
  var imagesToPreload = [];

  // try to preload image metadata
  var thumbnailUrl = sampleplayer.getMediaImageUrl_(media);
  if (thumbnailUrl) {
    imagesToPreload.push(thumbnailUrl);
  }

  if (imagesToPreload.length === 0) {
    doneFunc();
  } else {
    var counter = 0;
    var images = [];
    for (var i = 0; i < imagesToPreload.length; i++) {
      images[i] = new Image();
      images[i].src = imagesToPreload[i];
      images[i].onload = function() {
        if (++counter === imagesToPreload.length) {
          doneFunc();
        }
      };
    }
  }
};


/**
 * Causes the given element to fade in.
 *
 * @param {!Element} element The element to fade in.
 * @param {number} time The amount of time (in seconds) to transition.
 * @param {function()=} opt_doneFunc The function to call when complete.
 * @private
 */
sampleplayer.fadeIn_ = function(element, time, opt_doneFunc) {
  sampleplayer.fadeTo_(element, '', time, opt_doneFunc);
};


/**
 * Causes the given element to fade out.
 *
 * @param {!Element} element The element to fade out.
 * @param {number} time The amount of time (in seconds) to transition.
 * @param {function()=} opt_doneFunc The function to call when complete.
 * @private
 */
sampleplayer.fadeOut_ = function(element, time, opt_doneFunc) {
  sampleplayer.fadeTo_(element, 0, time, opt_doneFunc);
};


/**
 * Causes the given element to fade to the given opacity in the given
 * amount of time.
 *
 * @param {!Element} element The element to fade in/out.
 * @param {string|number} opacity The opacity to transition to.
 * @param {number} time The amount of time (in seconds) to transition.
 * @param {function()=} opt_doneFunc The function to call when complete.
 * @private
 */
sampleplayer.fadeTo_ = function(element, opacity, time, opt_doneFunc) {
  var listener = function() {
    element.style.webkitTransition = '';
    element.removeEventListener('webkitTransitionEnd', listener, false);
    if (opt_doneFunc) {
      opt_doneFunc();
    }
  };
  element.addEventListener('webkitTransitionEnd', listener, false);
  element.style.webkitTransition = 'opacity ' + time + 's';
  element.style.opacity = opacity;
};


/**
 * Utility function to get the extension of a URL file path.
 *
 * @param {string} url the URL
 * @return {string} the extension or "" if none
 * @private
 */
sampleplayer.getExtension_ = function(url) {
  var parts = url.split('.');
  // Handle files with no extensions and hidden files with no extension
  if (parts.length === 1 || (parts[0] === '' && parts.length === 2)) {
    return '';
  }
  return parts.pop().toLowerCase();
};


/**
 * Returns the application state.
 *
 * @param {cast.receiver.media.MediaInformation=} opt_media The current media
 *     metadata
 * @return {string} The application state.
 * @private
 */
sampleplayer.getApplicationState_ = function(opt_media) {
  if (opt_media && opt_media.metadata && opt_media.metadata.title) {
    return 'Now Casting: ' + opt_media.metadata.title;
  } else if (opt_media) {
    return 'Now Casting';
  } else {
    return 'Ready To Cast';
  }
};


/**
 * Returns the URL path.
 *
 * @param {string} url The URL
 * @return {string} The URL path.
 * @private
 */
sampleplayer.getPath_ = function(url) {
  var href = document.createElement('a');
  href.href = url;
  return href.pathname || '';
};


/**
 * Logging utility.
 *
 * @param {string} message to log
 * @private
 */
sampleplayer.CastPlayer.prototype.log_ = function(message) {
  if (this.debug_ && message) {
    console.log(message);
  }
};


/**
 * Sets the inner text for the given element.
 *
 * @param {Element} element The element.
 * @param {string=} opt_text The text.
 * @private
 */
sampleplayer.setInnerText_ = function(element, opt_text) {
  if (!element) {
    return;
  }
  element.innerText = opt_text || '';
};


/**
 * Sets the background image for the given element.
 *
 * @param {Element} element The element.
 * @param {string=} opt_url The image url.
 * @private
 */
sampleplayer.setBackgroundImage_ = function(element, opt_url) {
  if (!element) {
    return;
  }
  element.style.backgroundImage = (opt_url ? 'url("' + opt_url + '")' : 'none');
  element.style.display = (opt_url ? '' : 'none');
};
