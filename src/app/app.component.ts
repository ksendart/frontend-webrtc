import { Component } from '@angular/core';

const PEER_CONNECTION_CONFIG: RTCConfiguration = {
  iceServers: []
};

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'frontend-webrtc';

  // @ts-ignore
  peerConnection: RTCPeerConnection;
  // @ts-ignore
  signalingConnection: WebSocket;
  userData = { param1: "value1" };
  streamInfo = { applicationName: "webrtc", streamName: "1.stream", sessionId: "[empty]" };


  start() {
    this.setupSignalingServer();
  }

  private setupSignalingServer() {
    this.signalingConnection = new WebSocket(`ws://localhost:8889/stream`);
    this.signalingConnection.binaryType = 'arraybuffer';
    this.signalingConnection.onopen =  (res) => {
      console.log('connection open');
      this.setupPeerServer();
      this.signalingConnection.onmessage = this.getSignalMessageCallback.bind(this)
      this.signalingConnection.onerror = this.errorHandler.bind(this);

    };
    this.signalingConnection.onclose = function (r) {
      console.log('close');
    };
  }

  private setupPeerServer() {
    const self = this;
    this.peerConnection = new RTCPeerConnection(PEER_CONNECTION_CONFIG);
    this.peerConnection.onicecandidate = this.getIceCandidateCallback();
    this.peerConnection.ontrack = this.gotRemoteTrack;
    console.log("sendPlayGetOffer: " + JSON.stringify(self.streamInfo));
    self.signalingConnection.send('{"direction":"play", "command":"getOffer", "streamInfo":' +
      JSON.stringify(self.streamInfo) + ', "userData":' + JSON.stringify(self.userData) + '}');
  }

  gotRemoteTrack(event: any) {
    console.log(event);
    console.log('gotRemoteTrack: kind:' + event.track.kind + ' stream:' + event.streams[0]);
    const remoteVideo = document.querySelector('video');
    if (remoteVideo) {
      remoteVideo.srcObject = event.streams[0];
    }
  }
  private getSignalMessageCallback(): (arg: string) => void {
    return (message: any) => {
      console.log("wsConnection.onmessage: " + message.data);
      const signal = JSON.parse(message.data);
      const streamInfoResponse = signal['streamInfo'];
      if (streamInfoResponse !== undefined) {
        this.streamInfo.sessionId = streamInfoResponse.sessionId;
      }

      console.log('Received signal');
      console.log(signal);
      const msgCommand = signal['command'];

      if (signal.sdp) {
        console.log('sdp: ' + JSON.stringify(signal['sdp']));
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp))
          .then(() => {
            if (signal.sdp) {
              this.peerConnection.createAnswer()
                .then(this.setDescription())
                .catch(this.errorHandler);
            }
          })
          .catch(this.errorHandler);
      } else if (signal.ice) {
        console.log('ice: ' + JSON.stringify(signal.iceCandidates));
        this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.iceCandidates[0])).catch(this.errorHandler);
      }
      if ('sendResponse'.localeCompare(msgCommand) == 0) {
        if (this.signalingConnection != null) {
          this.signalingConnection.close();
        }
      }
    };
  }

  private getIceCandidateCallback(): (arg: any) => void {
    return (event) => {
      console.log(`got ice candidate:`);
      console.log(event);

      if (event.candidate != null) {
      }
    };
  }

  private setDescription(): (arg: any) => void {
    return (description) => {
      console.log('got description ');
      console.log(description);

      this.peerConnection.setLocalDescription(description)
        .then(() => {
          console.log('sendAnswer');
          this.signalingConnection.send('{"direction":"play", "command":"sendResponse", "streamInfo":' +
            JSON.stringify(this.streamInfo) + ', "sdp":' + JSON.stringify(description) + ',"userData":' + JSON.stringify(this.userData) + '}');
        })
        .catch(this.errorHandler);
    };
  }

  private errorHandler(error: any) {
    console.log(error);
  }
}
