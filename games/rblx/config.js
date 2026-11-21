// GN-BLOX site settings.
window.WEBBLOX_CONFIG = {
  // Multiplayer works out of the box: players connect straight to each other over PeerJS
  // (peer-to-peer, see p2p.js). PeerJS's free cloud only introduces the browsers; nothing to host.
  //
  // Optional: your own PeerJS server ("host[:port][/path]" or a full https:// URL) instead of
  // PeerJS's free cloud, e.g. 'peer.example.com/myapp'. Leave empty for the free cloud.
  peerServer: '',
  // Optional: address of a multiplayer server (tools/multiplayer-server) to use instead of
  // peer-to-peer, e.g. 'https://webblox-multiplayer.onrender.com'. Leave empty for peer-to-peer.
  multiplayerServer: '',
  // Set to false to turn multiplayer off.
  multiplayer: true
};
