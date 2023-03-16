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
    const self = this;
    this.signalingConnection = new WebSocket(`ws://localhost:8889/stream/ws`);

    this.signalingConnection.onerror = () => {
      console.log("ws error");
      if (this.signalingConnection === null) {
        return;
      }
      this.signalingConnection.close();
      // @ts-ignore
      this.signalingConnection = null;
    };

    this.signalingConnection.onclose = () => {
      console.log("ws closed");
      // @ts-ignore
      this.signalingConnection = null;
    };

    this.signalingConnection.onmessage = (msg) => this.onIceServers(msg);
  }

  onIceServers(msg: any) {
    if (this.signalingConnection === null) {
      return;
    }

    const iceServers = JSON.parse(msg.data);

    this.peerConnection = new RTCPeerConnection({
      iceServers,
    });

    this.signalingConnection.onmessage = (msg) => this.onRemoteDescription(msg);
    this.peerConnection.onicecandidate = (evt) => this.onIceCandidate(evt);

    this.peerConnection.oniceconnectionstatechange = () => {
      if (this.peerConnection === null) {
        return;
      }

      console.log("peer connection state:", this.peerConnection.iceConnectionState);

      switch (this.peerConnection.iceConnectionState) {
        case "disconnected":
          return;// this.scheduleRestart();
      }
    };

    this.peerConnection.ontrack = (evt) => {
      console.log("new track " + evt.track.kind);
      // @ts-ignore
      document.getElementById("remoteVideo").srcObject = evt.streams[0];
    };

    const direction = "sendrecv";
    this.peerConnection.addTransceiver("video", { direction });
    this.peerConnection.addTransceiver("audio", { direction });

    this.peerConnection.createOffer()
      .then((desc) => {
        if (this.peerConnection === null || this.signalingConnection === null) {
          return;
        }

        this.peerConnection.setLocalDescription(desc);

        console.log("sending offer");
        this.signalingConnection.send(JSON.stringify(desc));
      });
  }
  onRemoteDescription(msg: any) {
    if (this.peerConnection === null || this.signalingConnection === null) {
      return;
    }

    this.peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(msg.data)));
    this.signalingConnection.onmessage = (msg) => this.onRemoteCandidate(msg);
  }

  onRemoteCandidate(msg: any) {
    if (this.peerConnection === null) {
      return;
    }

    this.peerConnection.addIceCandidate(JSON.parse(msg.data));
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

  onIceCandidate(evt:any) {
    if (this.signalingConnection === null) {
      return;
    }

    if (evt.candidate !== null) {
      if (evt.candidate.candidate !== "") {
        this.signalingConnection.send(JSON.stringify(evt.candidate));
      }
    }
  }
  private getSignalMessageCallback(): (arg: string) => void {
    return (message: any) => {
      const iceServers = JSON.parse(message.data);

      this.peerConnection = new RTCPeerConnection({
        iceServers,
      });
      this.peerConnection.onicecandidate = (evt) => this.onIceCandidate(evt);

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
