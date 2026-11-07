sub init()
    m.video = m.top.findNode("video")
    m.audio = m.top.findNode("audio")
    m.radioPanel = m.top.findNode("radioPanel")
    m.radioTitle = m.top.findNode("radioTitle")
    m.radioDesc = m.top.findNode("radioDesc")
    m.radioState = m.top.findNode("radioState")
    m.error = m.top.findNode("error")
    m.saveTimer = m.top.findNode("saveTimer")
    m.player = m.video
    m.streams = []
    m.streamIndex = 0
    m.isLive = false
    m.isRadio = false
    m.lastLiveSave = 0
    m.closing = false

    m.video.observeField("state", "onState")
    m.audio.observeField("state", "onState")
    m.saveTimer.observeField("fire", "saveProgress")
    m.top.observeField("focusedChild", "onFocusChanged")
end sub

sub onContent()
    c = m.top.content
    if c = invalid then return
    m.isRadio = (c.itemType = "radio")
    m.isLive = isLiveType(c.itemType)
    if m.isRadio
        m.player = m.audio
        m.video.visible = false
        m.radioPanel.visible = true
        m.radioTitle.text = c.title
        m.radioDesc.text = c.description
    end if
    parsed = ParseJson(c.streamsJson)
    if parsed = invalid or parsed.Count() = 0
        parsed = [{ url: c.url, format: c.streamFormat }]
    end if
    m.streams = parsed
    m.streamIndex = 0
    hist_record(c.id, 0, c.durationSec, true)
    m.lastLiveSave = nowSec()
    playStream()
    m.saveTimer.control = "start"
end sub

sub playStream()
    c = m.top.content
    st = m.streams[m.streamIndex]
    pc = CreateObject("roSGNode", "ContentNode")
    pc.title = c.title
    pc.description = c.description
    pc.url = st.url
    pc.streamFormat = st.format
    pc.live = m.isLive
    if st.headers <> invalid and st.headers.Count() > 0 then pc.httpHeaders = st.headers
    if not m.isLive and m.top.startAt > 0 then pc.playStart = m.top.startAt
    m.player.content = pc
    m.player.control = "play"
    if m.isRadio then m.top.setFocus(true) else m.video.setFocus(true)
end sub

sub onState()
    st = m.player.state
    if st = "error"
        print "[Player] error "; m.player.errorCode; " "; m.player.errorMsg
        if m.streamIndex < m.streams.Count() - 1
            m.streamIndex = m.streamIndex + 1
            playStream()
        else
            m.error.text = "This stream isn't available right now." + chr(10) + "Press Back to choose something else."
            m.error.visible = true
        end if
    else if st = "finished"
        saveProgress()
        if not m.isLive then m.top.close = true
    end if
    if m.isRadio
        if st = "paused"
            m.radioState.text = "PAUSED"
        else if st = "buffering"
            m.radioState.text = "CONNECTING…"
        else if st = "playing"
            m.radioState.text = "LIVE RADIO"
        end if
    end if
end sub

sub saveProgress()
    c = m.top.content
    if c = invalid then return
    if m.isLive
        ' Live TV and radio: record listened/watched seconds since last save.
        now = nowSec()
        delta = now - m.lastLiveSave
        m.lastLiveSave = now
        if m.player.state = "playing" and delta > 0 then hist_record(c.id, delta, 0, false)
    else
        posSec = Int(m.video.position)
        dur = Int(m.video.duration)
        if dur <= 0 then dur = c.durationSec
        if m.video.state = "finished" then posSec = dur
        if posSec > 0 and dur > 0 then hist_record(c.id, posSec, dur, false)
    end if
end sub

sub onClose()
    if m.closing then return
    m.closing = true
    m.saveTimer.control = "stop"
    if m.player.state <> "error" then saveProgress()
    m.player.control = "stop"
    m.player.content = invalid
    m.top.closed = true
end sub

sub onFocusChanged()
    if m.top.hasFocus() and not m.isRadio then m.video.setFocus(true)
end sub

' Radio has no built-in UI, so OK toggles pause here. (Video handles its own keys.)
function onKeyEvent(key as string, press as boolean) as boolean
    if not press or not m.isRadio then return false
    if key = "OK" or key = "play"
        if m.audio.state = "paused"
            m.audio.control = "resume"
        else if m.audio.state = "playing"
            m.audio.control = "pause"
        end if
        return true
    end if
    return false
end function
