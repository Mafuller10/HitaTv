sub init()
    m.video = m.top.findNode("video")
    m.error = m.top.findNode("error")
    m.saveTimer = m.top.findNode("saveTimer")
    m.streams = []
    m.streamIndex = 0
    m.isLive = false
    m.lastLiveSave = 0
    m.closing = false

    m.video.observeField("state", "onState")
    m.saveTimer.observeField("fire", "saveProgress")
    m.top.observeField("focusedChild", "onFocusChanged")
end sub

sub onContent()
    c = m.top.content
    if c = invalid then return
    m.isLive = (c.source = "iptv")
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
    vc = CreateObject("roSGNode", "ContentNode")
    vc.title = c.title
    vc.description = c.description
    vc.url = st.url
    vc.streamFormat = st.format
    vc.live = m.isLive
    if st.headers <> invalid and st.headers.Count() > 0 then vc.httpHeaders = st.headers
    if not m.isLive and m.top.startAt > 0 then vc.playStart = m.top.startAt
    m.video.content = vc
    m.video.control = "play"
    m.video.setFocus(true)
end sub

sub onState()
    st = m.video.state
    if st = "error"
        print "[Player] error "; m.video.errorCode; " "; m.video.errorMsg
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
end sub

sub saveProgress()
    c = m.top.content
    if c = invalid then return
    if m.isLive
        ' Live: record watched seconds since last save.
        now = nowSec()
        delta = now - m.lastLiveSave
        m.lastLiveSave = now
        if m.video.state = "playing" and delta > 0 then hist_record(c.id, delta, 0, false)
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
    if m.video.state <> "error" then saveProgress()
    m.video.control = "stop"
    m.video.content = invalid
    m.top.closed = true
end sub

sub onFocusChanged()
    if m.top.hasFocus() then m.video.setFocus(true)
end sub
