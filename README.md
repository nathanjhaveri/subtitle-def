# Subtitle Def

A single-file, static React subtitle player for `.srt` files. It is meant to sit under or beside a video while you study French subtitles, with every word linked to French Wiktionary.

## Use

Open `index.html` directly in a browser, or serve it as a static file with nginx. Internet access is required because the page loads React, Babel, the subtitle parser, and Wiktionary previews from the web.

Click **Drop or select .srt file**, or drag an `.srt` file onto the load area. Playback, seeking, display modes, and dictionary previews all run client-side.

Use the left and right arrow keys to jump to the previous or next subtitle.

The last loaded subtitle file, position, and display mode are saved in browser local storage so refreshes can resume where you left off.

## SRT Support

SRT files are cue blocks separated by blank lines:

```srt
1
00:00:01,000 --> 00:00:03,500
Bonjour tout le monde.
```

The player uses the same `subtitle` parser family as Substitute, then adapts parsed cues into a small internal model. It handles common SRT variants such as CRLF/LF endings, BOMs, multi-line text, missing final blank lines, optional cue indices, dot milliseconds, timing settings, overlapping cues, and out-of-order cues.
