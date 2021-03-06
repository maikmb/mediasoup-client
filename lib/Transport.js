"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const awaitqueue_1 = require("awaitqueue");
const Logger_1 = __importDefault(require("./Logger"));
const EnhancedEventEmitter_1 = __importDefault(require("./EnhancedEventEmitter"));
const errors_1 = require("./errors");
const utils = __importStar(require("./utils"));
const ortc = __importStar(require("./ortc"));
const Producer_1 = __importDefault(require("./Producer"));
const Consumer_1 = __importDefault(require("./Consumer"));
const DataProducer_1 = __importDefault(require("./DataProducer"));
const DataConsumer_1 = __importDefault(require("./DataConsumer"));
const logger = new Logger_1.default('Transport');
class Transport extends EnhancedEventEmitter_1.default {
    /**
     * @emits connect - (transportLocalParameters: any, callback: Function, errback: Function)
     * @emits connectionstatechange - (connectionState: ConnectionState)
     * @emits produce - (producerLocalParameters: any, callback: Function, errback: Function)
     * @emits producedata - (dataProducerLocalParameters: any, callback: Function, errback: Function)
     */
    constructor({ direction, id, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, appData, Handler, extendedRtpCapabilities, canProduceByKind }) {
        super(logger);
        // Closed flag.
        this._closed = false;
        // Transport connection state.
        this._connectionState = 'new';
        // Map of Producers indexed by id.
        this._producers = new Map();
        // Map of Consumers indexed by id.
        this._consumers = new Map();
        // Map of DataProducers indexed by id.
        this._dataProducers = new Map();
        // Map of DataConsumers indexed by id.
        this._dataConsumers = new Map();
        // Whether the Consumer for RTP probation has been created.
        this._probatorConsumerCreated = false;
        // AwaitQueue instance to make async tasks happen sequentially.
        this._awaitQueue = new awaitqueue_1.AwaitQueue({ ClosedErrorClass: errors_1.InvalidStateError });
        logger.debug('constructor() [id:%s, direction:%s]', id, direction);
        this._id = id;
        this._direction = direction;
        this._extendedRtpCapabilities = extendedRtpCapabilities;
        this._canProduceByKind = canProduceByKind;
        this._maxSctpMessageSize =
            sctpParameters ? sctpParameters.maxMessageSize : null;
        // Clone and sanitize additionalSettings.
        additionalSettings = utils.clone(additionalSettings);
        delete additionalSettings.iceServers;
        delete additionalSettings.iceTransportPolicy;
        delete additionalSettings.bundlePolicy;
        delete additionalSettings.rtcpMuxPolicy;
        delete additionalSettings.sdpSemantics;
        this._handler = new Handler({
            direction,
            iceParameters,
            iceCandidates,
            dtlsParameters,
            sctpParameters,
            iceServers,
            iceTransportPolicy,
            additionalSettings,
            proprietaryConstraints,
            extendedRtpCapabilities
        });
        this._appData = appData;
        this._handleHandler();
    }
    /**
     * Transport id.
     */
    get id() {
        return this._id;
    }
    /**
     * Whether the Transport is closed.
     */
    get closed() {
        return this._closed;
    }
    /**
     * Transport direction.
     */
    get direction() {
        return this._direction;
    }
    /**
     * RTC handler instance.
     */
    get handler() {
        return this._handler;
    }
    /**
     * Connection state.
     */
    get connectionState() {
        return this._connectionState;
    }
    /**
     * App custom data.
     */
    get appData() {
        return this._appData;
    }
    /**
     * Invalid setter.
     */
    set appData(appData) {
        throw new Error('cannot override appData object');
    }
    /**
     * Close the Transport.
     */
    close() {
        if (this._closed)
            return;
        logger.debug('close()');
        this._closed = true;
        // Close the AwaitQueue.
        this._awaitQueue.close();
        // Close the handler.
        this._handler.close();
        // Close all Producers.
        for (const producer of this._producers.values()) {
            producer.transportClosed();
        }
        this._producers.clear();
        // Close all Consumers.
        for (const consumer of this._consumers.values()) {
            consumer.transportClosed();
        }
        this._consumers.clear();
        // Close all DataProducers.
        for (const dataProducer of this._dataProducers.values()) {
            dataProducer.transportClosed();
        }
        this._dataProducers.clear();
        // Close all DataConsumers.
        for (const dataConsumer of this._dataConsumers.values()) {
            dataConsumer.transportClosed();
        }
        this._dataConsumers.clear();
    }
    /**
     * Get associated Transport (RTCPeerConnection) stats.
     *
     * @returns {RTCStatsReport}
     */
    getStats() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._closed)
                throw new errors_1.InvalidStateError('closed');
            return this._handler.getTransportStats();
        });
    }
    /**
     * Restart ICE connection.
     */
    restartIce({ iceParameters }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('restartIce()');
            if (this._closed)
                throw new errors_1.InvalidStateError('closed');
            else if (!iceParameters)
                throw new TypeError('missing iceParameters');
            // Enqueue command.
            return this._awaitQueue.push(() => __awaiter(this, void 0, void 0, function* () { return this._handler.restartIce({ iceParameters }); }));
        });
    }
    /**
     * Update ICE servers.
     */
    updateIceServers({ iceServers } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('updateIceServers()');
            if (this._closed)
                throw new errors_1.InvalidStateError('closed');
            else if (!Array.isArray(iceServers))
                throw new TypeError('missing iceServers');
            // Enqueue command.
            return this._awaitQueue.push(() => __awaiter(this, void 0, void 0, function* () { return this._handler.updateIceServers({ iceServers }); }));
        });
    }
    /**
     * Create a Producer.
     */
    produce({ track, encodings, codecOptions, appData = {} } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('produce() [track:%o]', track);
            if (!track)
                throw new TypeError('missing track');
            else if (this._direction !== 'send')
                throw new errors_1.UnsupportedError('not a sending Transport');
            else if (!this._canProduceByKind[track.kind])
                throw new errors_1.UnsupportedError(`cannot produce ${track.kind}`);
            else if (track.readyState === 'ended')
                throw new errors_1.InvalidStateError('track ended');
            else if (this.listenerCount('connect') === 0 && this._connectionState === 'new')
                throw new TypeError('no "connect" listener set into this transport');
            else if (this.listenerCount('produce') === 0)
                throw new TypeError('no "produce" listener set into this transport');
            else if (appData && typeof appData !== 'object')
                throw new TypeError('if given, appData must be an object');
            // Enqueue command.
            return this._awaitQueue.push(() => __awaiter(this, void 0, void 0, function* () {
                let normalizedEncodings;
                if (encodings && !Array.isArray(encodings)) {
                    throw TypeError('encodings must be an array');
                }
                else if (encodings && encodings.length === 0) {
                    normalizedEncodings = undefined;
                }
                else if (encodings) {
                    normalizedEncodings = encodings
                        .map((encoding) => {
                        const normalizedEncoding = { active: true };
                        if (encoding.active === false)
                            normalizedEncoding.active = false;
                        if (typeof encoding.maxBitrate === 'number')
                            normalizedEncoding.maxBitrate = encoding.maxBitrate;
                        if (typeof encoding.maxFramerate === 'number')
                            normalizedEncoding.maxFramerate = encoding.maxFramerate;
                        if (typeof encoding.scaleResolutionDownBy === 'number')
                            normalizedEncoding.scaleResolutionDownBy = encoding.scaleResolutionDownBy;
                        if (typeof encoding.dtx === 'boolean')
                            normalizedEncoding.dtx = encoding.dtx;
                        if (typeof encoding.scalabilityMode === 'string')
                            normalizedEncoding.scalabilityMode = encoding.scalabilityMode;
                        if (typeof encoding.priority === 'string')
                            normalizedEncoding.priority = encoding.priority;
                        if (typeof encoding.networkPriority === 'string')
                            normalizedEncoding.networkPriority = encoding.networkPriority;
                        return normalizedEncoding;
                    });
                }
                const { localId, rtpSender, rtpParameters } = yield this._handler.send({
                    track,
                    encodings: normalizedEncodings,
                    codecOptions
                });
                try {
                    const { id } = yield this.safeEmitAsPromise('produce', {
                        kind: track.kind,
                        rtpParameters,
                        appData
                    });
                    const producer = new Producer_1.default({ id, localId, rtpSender, track, rtpParameters, appData });
                    this._producers.set(producer.id, producer);
                    this._handleProducer(producer);
                    return producer;
                }
                catch (error) {
                    this._handler.stopSending({ localId })
                        .catch(() => { });
                    throw error;
                }
            }))
                // This catch is needed to stop the given track if the command above
                // failed due to closed Transport.
                .catch((error) => {
                try {
                    track.stop();
                }
                catch (error2) { }
                throw error;
            });
        });
    }
    /**
     * Create a Consumer to consume a remote Producer.
     */
    consume({ id, producerId, kind, rtpParameters, appData = {} } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('consume()');
            if (this._closed)
                throw new errors_1.InvalidStateError('closed');
            else if (this._direction !== 'recv')
                throw new errors_1.UnsupportedError('not a receiving Transport');
            else if (typeof id !== 'string')
                throw new TypeError('missing id');
            else if (typeof producerId !== 'string')
                throw new TypeError('missing producerId');
            else if (kind !== 'audio' && kind !== 'video')
                throw new TypeError(`invalid kind '${kind}'`);
            else if (typeof rtpParameters !== 'object')
                throw new TypeError('missing rtpParameters');
            else if (this.listenerCount('connect') === 0 && this._connectionState === 'new')
                throw new TypeError('no "connect" listener set into this transport');
            else if (appData && typeof appData !== 'object')
                throw new TypeError('if given, appData must be an object');
            // Enqueue command.
            return this._awaitQueue.push(() => __awaiter(this, void 0, void 0, function* () {
                // Ensure the device can consume it.
                const canConsume = ortc.canReceive(rtpParameters, this._extendedRtpCapabilities);
                if (!canConsume)
                    throw new errors_1.UnsupportedError('cannot consume this Producer');
                const { localId, rtpReceiver, track } = yield this._handler.receive({ id, kind, rtpParameters });
                const consumer = new Consumer_1.default({ id, localId, producerId, rtpReceiver, track, rtpParameters, appData });
                this._consumers.set(consumer.id, consumer);
                this._handleConsumer(consumer);
                // If this is the first video Consumer and the Consumer for RTP probation
                // has not yet been created, create it now.
                if (!this._probatorConsumerCreated && kind === 'video') {
                    try {
                        const probatorRtpParameters = ortc.generateProbatorRtpParameters(consumer.rtpParameters);
                        yield this._handler.receive({
                            id: 'probator',
                            kind: 'video',
                            rtpParameters: probatorRtpParameters
                        });
                        logger.debug('consume() | Consumer for RTP probation created');
                        this._probatorConsumerCreated = true;
                    }
                    catch (error) {
                        logger.warn('consume() | failed to create Consumer for RTP probation:%o', error);
                    }
                }
                return consumer;
            }));
        });
    }
    /**
     * Create a DataProducer
     */
    produceData({ ordered = true, maxPacketLifeTime, maxRetransmits, priority = 'low', label = '', protocol = '', appData = {} } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('produceData()');
            if (this._direction !== 'send')
                throw new errors_1.UnsupportedError('not a sending Transport');
            else if (!this._maxSctpMessageSize)
                throw new errors_1.UnsupportedError('SCTP not enabled by remote Transport');
            else if (!['very-low', 'low', 'medium', 'high'].includes(priority))
                throw new TypeError('wrong priority');
            else if (this.listenerCount('connect') === 0 && this._connectionState === 'new')
                throw new TypeError('no "connect" listener set into this transport');
            else if (this.listenerCount('producedata') === 0)
                throw new TypeError('no "producedata" listener set into this transport');
            else if (appData && typeof appData !== 'object')
                throw new TypeError('if given, appData must be an object');
            if (maxPacketLifeTime || maxRetransmits)
                ordered = false;
            // Enqueue command.
            return this._awaitQueue.push(() => __awaiter(this, void 0, void 0, function* () {
                const { dataChannel, sctpStreamParameters } = yield this._handler.sendDataChannel({
                    ordered,
                    maxPacketLifeTime,
                    maxRetransmits,
                    priority,
                    label,
                    protocol
                });
                const { id } = yield this.safeEmitAsPromise('producedata', {
                    sctpStreamParameters,
                    label,
                    protocol,
                    appData
                });
                const dataProducer = new DataProducer_1.default({ id, dataChannel, sctpStreamParameters, appData });
                this._dataProducers.set(dataProducer.id, dataProducer);
                this._handleDataProducer(dataProducer);
                return dataProducer;
            }));
        });
    }
    /**
     * Create a DataConsumer
     */
    consumeData({ id, dataProducerId, sctpStreamParameters, label = '', protocol = '', appData = {} }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('consumeData()');
            if (this._closed)
                throw new errors_1.InvalidStateError('closed');
            else if (this._direction !== 'recv')
                throw new errors_1.UnsupportedError('not a receiving Transport');
            else if (!this._maxSctpMessageSize)
                throw new errors_1.UnsupportedError('SCTP not enabled by remote Transport');
            else if (typeof id !== 'string')
                throw new TypeError('missing id');
            else if (typeof dataProducerId !== 'string')
                throw new TypeError('missing dataProducerId');
            else if (typeof sctpStreamParameters !== 'object')
                throw new TypeError('missing sctpStreamParameters');
            else if (this.listenerCount('connect') === 0 && this._connectionState === 'new')
                throw new TypeError('no "connect" listener set into this transport');
            else if (appData && typeof appData !== 'object')
                throw new TypeError('if given, appData must be an object');
            // Enqueue command.
            return this._awaitQueue.push(() => __awaiter(this, void 0, void 0, function* () {
                const { dataChannel } = yield this._handler.receiveDataChannel({
                    sctpStreamParameters,
                    label,
                    protocol
                });
                const dataConsumer = new DataConsumer_1.default({
                    id,
                    dataProducerId,
                    dataChannel,
                    sctpStreamParameters,
                    appData
                });
                this._dataConsumers.set(dataConsumer.id, dataConsumer);
                this._handleDataConsumer(dataConsumer);
                return dataConsumer;
            }));
        });
    }
    _handleHandler() {
        const handler = this._handler;
        handler.on('@connect', ({ dtlsParameters }, callback, errback) => {
            if (this._closed) {
                errback(new errors_1.InvalidStateError('closed'));
                return;
            }
            this.safeEmit('connect', { dtlsParameters }, callback, errback);
        });
        handler.on('@connectionstatechange', (connectionState) => {
            if (connectionState === this._connectionState)
                return;
            logger.debug('connection state changed to %s', connectionState);
            this._connectionState = connectionState;
            if (!this._closed)
                this.safeEmit('connectionstatechange', connectionState);
        });
    }
    _handleProducer(producer) {
        producer.on('@close', () => {
            this._producers.delete(producer.id);
            if (this._closed)
                return;
            this._awaitQueue.push(() => __awaiter(this, void 0, void 0, function* () { return this._handler.stopSending({ localId: producer.localId }); }))
                .catch((error) => logger.warn('producer.close() failed:%o', error));
        });
        producer.on('@replacetrack', (track, callback, errback) => {
            this._awaitQueue.push(() => __awaiter(this, void 0, void 0, function* () { return this._handler.replaceTrack({ localId: producer.localId, track }); }))
                .then(callback)
                .catch(errback);
        });
        producer.on('@setmaxspatiallayer', (spatialLayer, callback, errback) => {
            this._awaitQueue.push(() => __awaiter(this, void 0, void 0, function* () {
                return (this._handler.setMaxSpatialLayer({ localId: producer.localId, spatialLayer }));
            }))
                .then(callback)
                .catch(errback);
        });
        producer.on('@setrtpencodingparameters', (params, callback, errback) => {
            this._awaitQueue.push(() => __awaiter(this, void 0, void 0, function* () {
                return (this._handler.setRtpEncodingParameters({ localId: producer.localId, params }));
            }))
                .then(callback)
                .catch(errback);
        });
        producer.on('@getstats', (callback, errback) => {
            if (this._closed)
                return errback(new errors_1.InvalidStateError('closed'));
            this._handler.getSenderStats({ localId: producer.localId })
                .then(callback)
                .catch(errback);
        });
    }
    _handleConsumer(consumer) {
        consumer.on('@close', () => {
            this._consumers.delete(consumer.id);
            if (this._closed)
                return;
            this._awaitQueue.push(() => __awaiter(this, void 0, void 0, function* () { return this._handler.stopReceiving({ localId: consumer.localId }); }))
                .catch(() => { });
        });
        consumer.on('@getstats', (callback, errback) => {
            if (this._closed)
                return errback(new errors_1.InvalidStateError('closed'));
            this._handler.getReceiverStats({ localId: consumer.localId })
                .then(callback)
                .catch(errback);
        });
    }
    _handleDataProducer(dataProducer) {
        dataProducer.on('@close', () => {
            this._dataProducers.delete(dataProducer.id);
        });
    }
    _handleDataConsumer(dataConsumer) {
        dataConsumer.on('@close', () => {
            this._dataConsumers.delete(dataConsumer.id);
        });
    }
}
exports.default = Transport;
