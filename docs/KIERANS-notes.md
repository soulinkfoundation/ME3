# Essential steps to make your personal OS + AI assistant work for you

1. Create your ME3 profile/site
2. Configure a custom domain (essential if you want full flexibility going forward.)
3. Configure custom email i.e. yourname/me3/assistant@YOURDOMAIN.com
4. Activate jobs for your assistant
5. Configure telegram bot to communicate with your assistant
6. Activate 'Mission Control' plugin
7. Customise ME3 for your own needs.

## ME3 PROFILE - yourme3url.com/create

Your assistant (and you) need clarity on who you are, who you serve and how. Your profile provides this.
It also doubles as a public website for your blog, newsletter, offerings, bookings and more.
AI agents can easily reference the yourdomain.com/me.json file that is automatically created when you create a profile.

## CUSTOM DOMAIN - cloudflare dashboard.

1. purchase your domain on cloudflare OR add existing one in cloudflare domains by following the instructions there.
1. Search 'workers', find your 'me3' worker installation -> click on 'Domains tab' -> add your domain.

## EMAIL (NEEDS work) yourme3url.com/email

Email setup is essential for actionable jobs an assistant can take on your behalf.
People will have different approaches here. i.e. Giving an assistant full access to your email Vs creating a custom email for it and forwarding only the essential to that.
Whatever your preference the goal is less time spent on email.

Reccommended approach.
Think of this as a long term transition away from email.
Keep one email address only for you, for now, i.e. your current primary email likely from gmail/yahoo/outlook
Give your assistant access to all other emails.
Slowly migrate responsibility of emails to be handled by your AI assistant.

Later when you add 'jobs' for your assistant, you will train them on what emails are actually important so they can be handled accordingly.

1. configure postmark/sendmail etc to be a sender of email
2. Cloudflare email routing -> enable your custom domain for email routing -> routing rules -> 'Create routing rule' ->
3. Add email pattern i.e. test@yourdomain.com
4. 'Action' -> 'Send to worker' -> choose your ME3 worker.
5. Now mail sent to this address will go to your email inbox.

## Assistant JOBS yourme3url.com/assistant

A job is a repeatable task your assistant can do.

## Mission Control https://yourme3url.com/mission-control

This is the place you capture everything:

1. tasks for your projects and for your assistant.
2. reminders/events for your calendar

Projects can be used to organise tasks.
The journal can be used for any notes which will be useful context for your assistant.
