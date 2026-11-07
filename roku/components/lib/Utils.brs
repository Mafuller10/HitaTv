' Small helpers shared by components and tasks.

function nowSec() as integer
    return CreateObject("roDateTime").AsSeconds()
end function

' Safe string: invalid/null -> ""
function s(v as dynamic) as string
    if v = invalid then return ""
    t = type(v)
    if t = "roString" or t = "String" then return v
    if t = "roInteger" or t = "Integer" or t = "LongInteger" then return v.ToStr()
    if t = "roFloat" or t = "Float" or t = "Double" or t = "roDouble" then return Str(v).Trim()
    if t = "roBoolean" or t = "Boolean" then
        if v then return "true"
        return "false"
    end if
    return ""
end function

' Safe integer: invalid/null -> 0
function n(v as dynamic) as integer
    if v = invalid then return 0
    t = type(v)
    if t = "roInteger" or t = "Integer" or t = "LongInteger" then return v
    if t = "roFloat" or t = "Float" or t = "Double" or t = "roDouble" then return Int(v)
    if t = "roString" or t = "String" then return v.ToInt()
    return 0
end function

function joinArr(arr as dynamic, sep as string) as string
    out = ""
    if arr = invalid then return out
    for i = 0 to arr.Count() - 1
        if i > 0 then out = out + sep
        out = out + s(arr[i])
    end for
    return out
end function

' 5400 -> "1h 30m", 300 -> "5m"
function fmtDuration(sec as integer) as string
    if sec <= 0 then return ""
    h = Int(sec / 3600)
    mins = Int((sec mod 3600) / 60)
    if h > 0 then return h.ToStr() + "h " + mins.ToStr() + "m"
    return mins.ToStr() + "m"
end function

' 3725 -> "1:02:05"
function fmtClock(sec as integer) as string
    h = Int(sec / 3600)
    mins = Int((sec mod 3600) / 60)
    secs = sec mod 60
    mm = mins.ToStr()
    ss = secs.ToStr()
    if secs < 10 then ss = "0" + ss
    if h > 0
        if mins < 10 then mm = "0" + mm
        return h.ToStr() + ":" + mm + ":" + ss
    end if
    return mm + ":" + ss
end function

' Badge text for a tile: type wins for radio/webcams, otherwise the source.
function badgeLabel(src as string, itemType as string) as string
    if itemType = "radio" then return "RADIO"
    if itemType = "webcam" then return "WEBCAM"
    if itemType = "live" and src = "famelack" then return "FAMELACK"
    if itemType = "live" then return "LIVE"
    return sourceLabel(src)
end function

function isLiveType(itemType as string) as boolean
    return itemType = "live" or itemType = "radio" or itemType = "webcam"
end function

function capitalize(t as string) as string
    if Len(t) = 0 then return t
    return UCase(Left(t, 1)) + Mid(t, 2)
end function

function sourceLabel(src as string) as string
    if src = "iptv" then return "LIVE"
    if src = "famelack" then return "FAMELACK"
    if src = "archive" then return "ARCHIVE"
    if src = "fawesome" then return "FAWESOME"
    if src = "retrocrush" then return "RETROCRUSH"
    return UCase(src)
end function
