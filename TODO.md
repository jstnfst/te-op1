# claude sits in an ivory tower
claude needs to bring other people onto his level. claude keeps his scripts for deployment, testing, dev server startup and teardown, why would we do this? we need to create a ./master-control.sh bash script that handles everything that we need to handle in this project: build, test, deploy, commit, push, everything that we would normally see scripted by our claude agent but that we should really ship as a feature of the development environment. master-control.sh should use subcommands to help choose the functionality that is executed. examples:

subcommand params
dev status
dev up
dev down
build c
test website
webapp typecheck
webapp build

enter plan mode and let's worktogether on this: are there more commands and subcommands that claude usually scripts temporarily and throws away during our sessions that we can reuse for people that don't have claude?

# hero on lab hover and the library hover
right now we have, on the Hero, an ADSR curve in the LAB button that changes onhover, and the animated scope in the hero should be changed to make sense. we have the data required to show an interesting image. lets generate some interesting graphic to show when each of the layout items is hovered. it should be visually interesting, and when swapping between the different layouts should not disturb the visuals too too much -- should be smooth. the default state should show something such that the default state is interesting to look at if the user hovered it and the mouseover exited. also, the library hover state when in the default state (mouseover exit), should also be interesting.

# nav element for patch editor
we need an editor nav element "EDITOR" that is activated when the user is editing a patch. we can keep the INSPECTOR nav element in the LAB page. we need a default state for the patch editor that makes sense for logged in and anonymous users who navigate to the EDITOR without first choosing a patch or pack to edit.

# active checkboxes are greyed out but work and other greying out
when greying out a control, that means it's disabled. however, we can click on ACTIVE checkboxes in the patch editor. never make these "ACTIVE" checkbox controls look disabled, because it seems like they're always able to click. when the controls inside the panel are disabled, even the orange color should become monochrome. I don't like how the section header is greyed out. i think the text should always have the same visibility so don't grey that out either.


