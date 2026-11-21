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
  multiplayer: true,

  // The site's owner and moderators, by GN-BLOX account ID (the Admin page and the logged-in
  // Log In page show yours). They get admin commands in games (:kick, :ban, :m ... type :cmds in
  // chat) and an [Owner] / [Mod] tag. An ID is made from the account's username and password, so
  // only someone who knows that password can use it. Example: owners: ['AbC...43 characters'].
  owners: ['as9j3gPFONpREj678qIwrB2lw2U_sv7o1MiJj8HmHbE'],
  mods: []
};
