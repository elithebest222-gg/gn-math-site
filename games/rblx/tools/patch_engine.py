#!/usr/bin/env python3
"""Engine fixes applied to the original WebBlox build (already applied to the
rblx.js / rblx.wasm in this folder; kept here so the change is documented and
repeatable on a fresh copy of the original files).

1. Lua errors no longer kill the game.
   The build lost the C++ try/catch inside Lua's protected calls, so any Lua
   error -- even inside pcall -- and any C++ exception raised by an engine API
   ("X is not a valid member of Y") unwound out of the engine thread and froze
   the game. The protected calls in luaD_pcall and lua_resume now go through
   Emscripten's invoke_* JS wrappers with a marker bit on the table index, and
   rblx.js turns a caught exception into a normal Lua error.

2. Script.LinkedSource requests are answered immediately with an empty script.
   They used to fail against the missing asset server and the place loader
   waited for them forever.

3. A malformed request URL no longer kills a worker thread.

4. Lite-multiplayer sync requests skip the engine's custom headers (no CORS
   preflight per request).

5. Groundwork for the engine's own ?replication=1 mode: fixes a message-length
   bug in Emscripten's socket bridge and lets the page set Module.bridgeUrl.
   (That mode still can't work: the build is missing RakNet's reliable-send code.)

usage: python3 patch_engine.py ../rblx.wasm ../rblx.js
"""
import sys

FLAG = 0x40000000
IMPORTED_FUNCS = 408
INVOKE_VII, INVOKE_IIII = 1, 19
F_PRECALL, F_EXECUTE, F_PUSHSTRING, F_PCALL, F_RESUME = 1259, 1333, 1100, 1264, 1262


def uleb(v):
    out = bytearray()
    while True:
        b = v & 0x7f
        v >>= 7
        out.append(b | (0x80 if v else 0))
        if not v:
            return bytes(out)


def sleb(v):
    out = bytearray()
    while True:
        b = v & 0x7f
        v >>= 7
        done = (v == 0 and not b & 0x40) or (v == -1 and b & 0x40)
        out.append(b | (0 if done else 0x80))
        if done:
            return bytes(out)


def rleb(b, o):
    r = s = 0
    while True:
        x = b[o]
        o += 1
        r |= (x & 0x7f) << s
        s += 7
        if not x & 0x80:
            return r, o


def sections(d):
    o, out = 8, []
    while o < len(d):
        sid = d[o]
        size, p = rleb(d, o + 1)
        out.append((sid, o, p, p + size))   # id, header start, payload start, end
        o = p + size
    return out


def patch(d):
    secs = sections(d)
    sec = {sid: (h, p, e) for sid, h, p, e in secs if sid != 0}
    new = {}

    # --- table: grow by 3 -------------------------------------------------
    h, p, e = sec[4]
    t = d[p:e]
    n, q = rleb(t, 0)
    assert n == 1 and t[q] == 0x70 and t[q + 1] == 1
    mn, q2 = rleb(t, q + 2)
    mx, q3 = rleb(t, q2)
    assert mn == mx == 39623, (mn, mx)
    base = mn
    new[4] = uleb(1) + bytes([0x70, 1]) + uleb(mn + 3) + uleb(mx + 3)

    # --- elem: append precall, execute, pushstring ---------------------------
    h, p, e = sec[9]
    el = d[p:e]
    n, q = rleb(el, 0)
    assert n == 1
    flags, q = rleb(el, q)
    assert flags == 0 and el[q] == 0x41
    q += 1
    while el[q] & 0x80:
        q += 1
    q += 1
    assert el[q] == 0x0b
    q += 1
    cnt, q4 = rleb(el, q)
    assert 1 + cnt == base
    new[9] = el[:q] + uleb(cnt + 3) + el[q4:] + uleb(F_PRECALL) + uleb(F_EXECUTE) + uleb(F_PUSHSTRING)
    T_PRECALL, T_EXECUTE, T_PUSHSTRING = base, base + 1, base + 2

    # --- code bodies ----------------------------------------------------------
    h, p, e = sec[10]
    code = d[p:e]
    n, q = rleb(code, 0)
    bodies = []
    for _ in range(n):
        sz, q2 = rleb(code, q)
        bodies.append((q2, q2 + sz))
        q = q2 + sz
    code_abs = p

    def body(fi):
        s, t = bodies[fi - IMPORTED_FUNCS]
        return bytearray(code[s:t]), code_abs + s

    def replace(b, babs, at_abs, old, newb):
        i = at_abs - babs
        assert bytes(b[i:i + len(old)]) == old, (hex(at_abs), b[i:i + len(old)].hex(), old.hex())
        b[i:i + len(old)] = newb

    # luaD_pcall: (*func)(L, u) via call_indirect -> invoke_vii(func|FLAG, L, u)
    b1, a1 = body(F_PCALL)
    replace(b1, a1, 0x0f9702, bytes.fromhex('2000200220011104 00'.replace(' ', '')),
            b'\x41' + sleb(FLAG) + bytes.fromhex('200172') + bytes.fromhex('20002002') + b'\x10' + uleb(INVOKE_VII))

    # lua_resume: 3 extra i32 locals (5,6,7), wrap luaD_precall and luaV_execute
    b2, a2 = body(F_RESUME)
    assert b2[0] == 1 and b2[1] == 3 and b2[2] == 0x7f, b2[:3].hex()
    # replace from the end first so earlier offsets stay valid
    replace(b2, a2, 0x0f9534, b'\x10' + uleb(F_EXECUTE),
            bytes.fromhex('21062105') + b'\x41' + sleb(T_EXECUTE | FLAG) + bytes.fromhex('20052006') + b'\x10' + uleb(INVOKE_VII))
    replace(b2, a2, 0x0f94a9, b'\x10' + uleb(F_PRECALL),
            bytes.fromhex('210721062105') + b'\x41' + sleb(T_PRECALL | FLAG) + bytes.fromhex('200520062007') + b'\x10' + uleb(INVOKE_IIII))
    b2[1] = 6

    out = bytearray(uleb(n))
    for fi in range(n):
        if fi + IMPORTED_FUNCS == F_PCALL:
            bb = bytes(b1)
        elif fi + IMPORTED_FUNCS == F_RESUME:
            bb = bytes(b2)
        else:
            s, t = bodies[fi]
            bb = code[s:t]
        out += uleb(len(bb)) + bb
    new[10] = bytes(out)

    res = bytearray(d[:8])
    for sid, hh, pp, ee in secs:
        if sid in new and sid != 0:
            res += bytes([sid]) + uleb(len(new[sid])) + new[sid]
        else:
            res += d[hh:ee]
    return bytes(res), (T_PRECALL, T_EXECUTE, T_PUSHSTRING)




def patch_js(s, PUSHSTRING_TABLE_INDEX):
    old_vii = 'function invoke_vii(index,a1,a2){var sp=stackSave();try{getWasmTableEntry(index)(a1,a2)}catch(e){stackRestore(sp);if(!(e instanceof EmscriptenEH))throw e;_setThrew(1,0)}}'
    old_iiii = 'function invoke_iiii(index,a1,a2,a3){var sp=stackSave();try{return getWasmTableEntry(index)(a1,a2,a3)}catch(e){stackRestore(sp);if(!(e instanceof EmscriptenEH))throw e;_setThrew(1,0)}}'
    assert s.count(old_vii) == 1 and s.count(old_iiii) == 1
    helper = ('/* WebBlox: protected Lua calls (luaD_pcall/lua_resume, see rblx.wasm patch) turn a thrown '
              'C++ exception into a Lua error instead of killing the engine thread. */'
              'var LUA_PROTECTED=1073741824;'
              'function luaProtectedError(e,sp,L){stackRestore(sp);if(!(e instanceof CppException))throw e;'
              'growMemViews();var lj=HEAPU32[L+88>>2];'
              'if(lj&&HEAP32[lj+8>>2]==0){HEAP32[lj+8>>2]=2;'
              'var msg=String(e.message||e.name||"C++ exception");var n=lengthBytesUTF8(msg)+1;var p=stackAlloc(n);'
              'stringToUTF8(msg,p,n);getWasmTableEntry(%d)(L,p);stackRestore(sp)}'
              # lua_exception's destructor resets lj->status and pops the error message, so keep both
              'growMemViews();var st=lj?HEAP32[lj+8>>2]:0,top=HEAPU32[L+16>>2];'
              'try{___cxa_begin_catch(e.excPtr);___cxa_end_catch()}catch(_){}'
              'growMemViews();if(lj)HEAP32[lj+8>>2]=st;HEAPU32[L+16>>2]=top}') % PUSHSTRING_TABLE_INDEX
    new_vii = ('function invoke_vii(index,a1,a2){var sp=stackSave();if(index&LUA_PROTECTED){try{getWasmTableEntry(index&~LUA_PROTECTED)(a1,a2)}catch(e){luaProtectedError(e,sp,a1)}return}'
               'try{getWasmTableEntry(index)(a1,a2)}catch(e){stackRestore(sp);if(!(e instanceof EmscriptenEH))throw e;_setThrew(1,0)}}')
    new_iiii = ('function invoke_iiii(index,a1,a2,a3){var sp=stackSave();if(index&LUA_PROTECTED){try{return getWasmTableEntry(index&~LUA_PROTECTED)(a1,a2,a3)}catch(e){luaProtectedError(e,sp,a1);return 1}}'
                'try{return getWasmTableEntry(index)(a1,a2,a3)}catch(e){stackRestore(sp);if(!(e instanceof EmscriptenEH))throw e;_setThrew(1,0)}}')
    s = s.replace(old_vii, helper + new_vii).replace(old_iiii, new_iiii)

    old_url = 'var url_=UTF8ToString(url);var fetch_attr=fetch+108;'
    assert s.count(old_url) == 1
    s = s.replace(old_url, 'var url_=UTF8ToString(url);if(/[?&]serverplaceid=/.test(url_))url_="data:text/plain,";var fetch_attr=fetch+108;')

    # A malformed URL made XMLHttpRequest.open throw inside a worker, killing that thread.
    old_open = 'xhr.open(requestMethod,url_,!fetchAttrSynchronous,userNameStr,passwordStr);'
    assert s.count(old_open) == 1
    s = s.replace(old_open, 'try{xhr.open(requestMethod,url_,!fetchAttrSynchronous,userNameStr,passwordStr)}catch(e){onerror(fetch,"invalid url");return}')

    # WebBlox lite-multiplayer sync requests (scripts/WebBloxPlayers.lua -> /sync?room=...) skip the
    # engine's custom headers: they'd force a CORS preflight before every request.
    old_hdr = 'var keyStr=UTF8ToString(key);var valueStr=UTF8ToString(value);xhr.setRequestHeader(keyStr,valueStr)'
    assert s.count(old_hdr) == 1
    s = s.replace(old_hdr, 'var keyStr=UTF8ToString(key);var valueStr=UTF8ToString(value);if(!/\\/sync\\?room=/.test(url_))xhr.setRequestHeader(keyStr,valueStr)')

    # Multiplayer groundwork (only used with ?replication=1):
    # - Emscripten's socket bridge sends getsockname/getpeername with a negative length
    #   (16 + addrlen - 256), which went out as an empty message and hung the caller.
    old_send = 'function _emscripten_websocket_send_binary(socketId,binaryData,dataLength){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(53,0,1,socketId,binaryData,dataLength);'
    assert s.count(old_send) == 1
    s = s.replace(old_send, old_send + 'if(dataLength<0)dataLength=16;')
    # - the bridge URL is hard-coded to ws://127.0.0.1:4016; let the page point it at a relay.
    old_ws = 'var url=UTF8ToString((growMemViews(),HEAPU32)[SAFE_HEAP_INDEX((growMemViews(),HEAPU32),createAttributes>>2,"loading")]);'
    assert s.count(old_ws) == 1
    s = s.replace(old_ws, old_ws + 'if(url=="ws://127.0.0.1:4016"&&Module["bridgeUrl"])url=Module["bridgeUrl"];')
    return s


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    wasm_path, js_path = sys.argv[1], sys.argv[2]
    wasm, idx = patch(open(wasm_path, 'rb').read())
    js = patch_js(open(js_path).read(), idx[2])
    open(wasm_path, 'wb').write(wasm)
    open(js_path, 'w').write(js)
    print('patched', wasm_path, 'and', js_path)
