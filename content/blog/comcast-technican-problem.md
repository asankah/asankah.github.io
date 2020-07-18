---
title: The Comcast Technician Problem
author: Asanka Herath
summary: |
  Given a set of tasks, incentives are often aligned towards dropping a task
  rather than allowing for perpetual accretion of delays.
date: 2020-07-13T13:21:51-04:00
tags:
  - Commentary
  - Process
---

## The Story

As is a rite of passage in these parts, I waited for the Comcast[^1] technician
to arrive during their scheduled appointment window. In preparation I had
scheduled a day of working from home.

As the appointment window unceremoniously came to a close vacillated over when
it would be a reasonable time to call Comcast again to see what's going on.
That's when I noticed the technician's truck pull up beside our house. They
rolled down the window and surveyed the scene for a brief moment, looked at
something inside their truck, rolled up the window and promptly drove off.

"That's it," I thought. That was the right time to call Comcast. That's what
I did. After a long wait[^2] the friendly service person on the other end of
the line told me that the according to the technician nobody answered the door.
It took some convincing on my part to establish that:

  a) I was there the whole time. Nobody rang the doorbell.
  b) The doorbell works.
  c) The technician --- assuming that the person who drove by was the scheduled
  technician --- did drive by, but they didn't get out of the vehicle to ring
  any doorbell.
  d) My phone didn't ring, nor does it indicate any missed calls.
  e) My phone works and has a signal.

They were kind enough to ask the technician to return, but noted that the
appointment window would now be unpredictable due to prior appointments. Sure.

Much later that evening, the same technician who drove by earlier showed up.
After they were done, I thanked them for showing up and mentioned what happened
to the original appointment slot. I didn't mention anything about seeing the
same technician before. After all I was just happy that I was done with this and
didn't want to cause any trouble.

He said that technicians sometimes skip slots when they are running behind
schedule.

## The Problem

Looking at what happened from the perspective of the technician, the logic
behind all this becomes a little clearer.

You see, had the technician had tried to honor the original appointment --- one
which they were already late for --- they would've been even more late for the
next one. This would continue down the line until by the end of the day pretty
much all of his appointments that afternoon would've registered as _late_.

Had they skipped one -- my appointment as the case turned out -- then they'd
potentially be on time for the rest of their appointments. The one they skipped
could later be justified as one where the customer was not at home or any other
reasonable excuses. Even if they were truthful and were penalized for missing an
appointment, it's likely that they'd still be better off than being late for so
many more appointments. Either way, the outcome is both better for the
technician, and more importantly, for their supervisor.

In the books, the two situations look like this:

--------------------------------------------------------------------------------
Technician's Choice Successful appointments Late appointments "No-show"s [^3]
------------------- ----------------------- ----------------- ------------------
Honor all slots     $g$                     $l$               $n$

Skip when late      $g + l - s$             $0$               $n + s$

--------------------------------------------------------------------------------
The outcomes depending on the technician's decision on what to do with
late appointments. {#table:outcomes}

$g$ are the _good_ slots where the technician is able to show
up during the appointment window. $l$ are those where the technician was not
available during the appointment window. In either case some number of
households are not going to be home or not ready for service. Those are $n$.

When the technician decides to skip late appointments some number -- $s$ in the
table above -- will turn into additional no-shows. However, skipping these will
mean that the technician can make it to $l-s$ appointments on time.

Assuming $l-s > 0$, then the outcome of the _skip when late_ strategy is
strictly better for the technician's supervisor. I can't imagine there being any
incentive for the supervisor to penalize this strategy. So the technician also
gets off scott free.

## Why This Is Relevant

It's easy to harp on Comcast[^1] and some random lowly technician. But this
incentive pattern is everywhere. Even at Google and s.

Every time you measure someone's success on _how well_ they handled a number of
issues or cases without taking into account _the cost they incurred_ to get
there, you are creating a Comcast Technician problem for your subordinates.

## But Is It Bad?

Dropping tasks instead of unbounded accretion of delay is sometimes a better
strategy.

One might even argue that this is the cost of doing business and it would
actually makes sense. One customer's (or user's or client's or patient's)
convenience doesn't outweigh the convenience of many others.

There could be additional complicating factors involved:

* What's the cost of skipping or rescheduling a case? Is the cost bourne by you?
  How much of the cost is bourne by the customer?
  
* How do you choose which case to skip? It might be that the case to skip isn't
  the one that's late, but one later down the schedule that's much cheaper to
  reschedule or less damaging to cancel.

In either case, be forgiving when you inevitably find yourself as the one who
got the short end of the stick.

It just might be that all parties involved are rational actors, and there's
really not a great alternative. Sometimes it's just life.

[^1]: [*The Verge*. _The worst company in
America._](https://www.theverge.com/2014/8/19/6004131/comcast-the-worst-company-in-america)
(Accessed July 13, 2020)

[^2]: [*Urban Dictionary*. _Long
Wait_](https://www.urbandictionary.com/define.php?term=Long%20Wait) (Accessed
July 13, 2020)

[^3]: "No-shows" are just going to be rescheduled. It's not the end of the
world.