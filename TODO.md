# the lab/layout filter is in two places
directly underneath the layout tab in the header is another tab group that filters the results of the knob layouts shown. the SCALE section is yet another filter component. we really ought to have a filter component that makes sense with both of these filters. once the top level filter is chosen (synth, envelope, fx, lfo) that should update the counts on the SCALE filter as well.

# editor page hint text is too focused on a single use case
generalize the editor page's hint text at the top. "with a pack picked, save new puts the copy in that pack" i mean, that's good hint text but only covers a single use case. perhaps the bottom of the page should have a list of meaningful hints if the user expands a help section. we can elucidate such intricate use cases here for all the elements on this editor: copying, tagging, pack and patch editing, opening files, dragging and dropping, put the knob color legend in the help, etc.

# the clipboard needs a scroll panel. show at least 3 clipboard items
the remove clipboard needs to be a trash icon and look more like a button.

# library/mine needs a make public/private on packs
additionally, the make public/private buttons need to be the same width because it messes with the vertical spacing. if there are hundreds or thousands of users, the favorites button should look good vertically, too. in fact, remove the count inside the button, and put the favorite count under the "DOWNLOADS" section, rename that column to "POPULARITY" and show downloads and favorites counts in a column. in fact, change the private/public to an eyeball icon that is closed with a slash over it when private or an open eyeball when public. the confirmation should still show the text, but change to it to CONFIRM? not sure how we're going to maintain the vertical spacing, so maybe just float the confirm button while it's shown.

# grid view
we need to ensure the grid view actually does something meaningful, such as show every tags chip instead of overflow:hidden. the favorites button on the grid chip is not the same height as the rest of the buttons.

# change every delete button to use a trashcan icon
grid views and list views use a delete button. change to trash icon to tighten up the display space.

# you reported dead code in public/; remove them if safe to do so

# make the grid view more visually interesting
and the alignment of things should look good. there should not be a mix of text and button elements in the same control panel surface area.
