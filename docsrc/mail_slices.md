# Mail Slices

Mail slices are a persistent view into a sub-range of the messages in a folder.

The key characteristics of a MailSlice are:

- You get updates to any messages already known to the MailSlice

- You get told about new messages in the range covered by the slice.  If your
slice includes the most recent message known to the folder, then your slice
conceptually extends through 'now', and you will be told about new messages.

- You get told about messages removed from the slice.

- Slices 'grow' and 'shrink' at either of their two ends.  If you want more
messages for buffering reasons, you grow the slice in that direction.  If you
have too many messages buffered in a given direction, you can shrink the slice.
You would want to shrink the slice so the back-end can stop worry about sending
you updates for messages you don't care about, or about keeping those messages
cached in memory.

- Slices can trigger IMAP synchronization.  If the slice wants to 'grow' further
back in time, it can do so and we will attempt to synchronize additional
messages from the server.  An explicit flag needs to be passed so that the
front-end does not trigger synchronization accidentally.


The rationale for mail slices goes something like this:

- The front-end/UI only needs to know about changes that will be presented to
the user.

- Knowing what the front-end is showing the user lets the back-end improve its
responsiveness by caching and pre-fetching based on that knowledge.  Especially
since the default access pattern is scrolling.

- We can't keep everything in memory, so some type of paging/stream model is
required.

- Obsolete: In the case of variable-height message display where display heights
are not precomputed in storage, a stream model like ours is appropriate since
seeking in screen coordinates is impossible.  This is obsoleted because the
benefit of a more lazy scroll model has become clear, we currently use a fixed
height message display, and even if we didn't use a fixed height, it's not
that hard to either estimate message heights, use a quantized height display
model based on important, or cache/compute heights ahead of time.  (Variable
width displays complicate things, but that's where a quantized layout or other
metrics such as storing the 'run length' of the important values can come in.

## What the request looks like

- Slice opened
- Cached messages returned
- Refresh of that slice initiated

```jumly+sequence

@found "UI", ->
  @message "viewFolderMessages", "MailAPI" ->
    @message "(postMessage)", "MailBridge" ->
      @message "sliceOpenMostRecent", "FolderStorage"

```
