' On-device recommendations. Runs inside CatalogTask (background thread).
'
' Profile: each history entry adds weight to its item's genres and source:
'     w = decay * (0.3 + completion) * min(plays, 3)      decay = 0.5 ^ (ageDays / 14)
' Quick abandons (< 10% of a VOD title) count negatively.
' Score per candidate:
'     0.60 * cosine(profile genres, item genres) + 0.25 * popularity + 0.15 * source affinity
' Then MMR re-ranking (lambda 0.75) so one genre/source doesn't fill the whole row.
' Requires Utils.brs and History.brs.

function rec_profile(h as object, items as object) as object
    p = { genres: {}, sources: {}, sourceTotal: 0.0, plays: 0 }
    now = nowSec()
    for each id in h.items
        e = h.items[id]
        it = items[id]
        if it <> invalid
            ageDays = (now - e.t) / 86400.0
            decay = 2 ^ (-ageDays / 14.0)
            c = hist_completion(e)
            plays = e.n
            if plays > 3 then plays = 3
            if plays < 1 then plays = 1
            if e.d > 0 and c < 0.1 and e.p > 20
                w = -0.3 * decay
            else
                w = decay * (0.3 + c) * plays
            end if
            gs = it.genres
            if gs <> invalid and gs.Count() > 0
                gw = w / Sqr(gs.Count())
                for each g in gs
                    if p.genres[g] = invalid then p.genres[g] = 0.0
                    p.genres[g] = p.genres[g] + gw
                end for
            end if
            if w > 0
                if p.sources[it.source] = invalid then p.sources[it.source] = 0.0
                p.sources[it.source] = p.sources[it.source] + w
                p.sourceTotal = p.sourceTotal + w
                p.plays = p.plays + 1
            end if
        end if
    end for
    return p
end function

function rec_jaccard(a as object, b as object) as float
    if a = invalid or b = invalid or a.Count() = 0 or b.Count() = 0 then return 0
    inter = 0
    for each x in a
        for each y in b
            if x = y then inter = inter + 1
        end for
    end for
    return inter / (a.Count() + b.Count() - inter)
end function

' filterFn: "" (any), "live", "vod", "anime"
function rec_matches(it as object, filterFn as string) as boolean
    if filterFn = "" then return true
    if filterFn = "live" then return it.type = "live" or it.type = "radio" or it.type = "webcam"
    if filterFn = "vod" then return it.type = "movie" or it.type = "series"
    if filterFn = "anime"
        for each g in it.genres
            if g = "anime" or g = "animation" then return true
        end for
        return false
    end if
    return true
end function

' Returns an array of item ids, or [] when there is not enough history (cold start).
function rec_recommend(h as object, items as object, limit as integer, filterFn as string) as object
    p = rec_profile(h, items)
    if p.plays < 3 then return []

    norm = 0.0
    for each g in p.genres
        if p.genres[g] > 0 then norm = norm + p.genres[g] * p.genres[g]
    end for
    if norm <= 0 then return []
    norm = Sqr(norm)

    cands = []
    for each id in items
        it = items[id]
        e = h.items[id]
        finished = (e <> invalid and (it.type = "movie" or it.type = "series") and hist_completion(e) >= 0.92)
        if not finished and rec_matches(it, filterFn)
            gs = it.genres
            cosv = 0.0
            if gs <> invalid and gs.Count() > 0
                dot = 0.0
                for each g in gs
                    pw = p.genres[g]
                    if pw <> invalid and pw > 0 then dot = dot + pw
                end for
                cosv = dot / (norm * Sqr(gs.Count()))
            end if
            srcAff = 0.0
            if p.sourceTotal > 0 and p.sources[it.source] <> invalid then srcAff = p.sources[it.source] / p.sourceTotal
            score = 0.6 * cosv + 0.25 * it.popularity + 0.15 * srcAff
            if cosv > 0 then cands.Push({ id: id, s: score, g: gs })
        end if
    end for
    cands.SortBy("s", "r")
    while cands.Count() > 80
        cands.Pop()
    end while

    ' MMR diversity re-rank.
    out = []
    picked = []
    used = {}
    while out.Count() < limit and out.Count() < cands.Count()
        bestI = -1
        bestV = -999.0
        for i = 0 to cands.Count() - 1
            c = cands[i]
            if used[c.id] = invalid
                maxSim = 0.0
                for each sel in picked
                    sim = rec_jaccard(c.g, sel.g)
                    if sim > maxSim then maxSim = sim
                end for
                v = 0.75 * c.s - 0.25 * maxSim
                if v > bestV
                    bestV = v
                    bestI = i
                end if
            end if
        end for
        if bestI < 0 then exit while
        used[cands[bestI].id] = true
        picked.Push(cands[bestI])
        out.Push(cands[bestI].id)
    end while
    return out
end function

' Entries sorted most-recent first, as [{id, e}], optionally filtered.
function rec_recent(h as object, items as object, filterFn as string) as object
    arr = []
    for each id in h.items
        it = items[id]
        if it <> invalid and rec_matches(it, filterFn) then arr.Push({ id: id, t: h.items[id].t, e: h.items[id] })
    end for
    arr.SortBy("t", "r")
    return arr
end function

function rec_continueWatching(h as object, items as object) as object
    out = []
    for each r in rec_recent(h, items, "vod")
        c = hist_completion(r.e)
        if items[r.id].playable = true and c > 0.03 and c < 0.92 then out.Push(r.id)
    end for
    return out
end function

' "Because you watched X": the most recent title watched meaningfully (>= 25% or a live channel for 5+ min).
function rec_becauseYouWatched(h as object, items as object, filterFn as string) as object
    for each r in rec_recent(h, items, filterFn)
        it = items[r.id]
        meaningful = (r.e.d > 0 and hist_completion(r.e) >= 0.25) or (r.e.d = 0 and r.e.p >= 300) or (it.playable <> true)
        if meaningful and it.similar <> invalid and it.similar.Count() >= 4
            return { title: it.title, ids: it.similar }
        end if
    end for
    return invalid
end function
