# SSSB Laundry Automation

## What is this?

In the Stockholm Student Housing ([SSSB](https://sssb.se/)), the laundry rooms are booked through a website.
[The website](https://sssb.aptustotal.se/AptusPortal/Account/Login) is slow, and the booking process is cumbersome.
This project aims to simplify the booking process by automatically scraping the website and sending calendar invites to the users, allowing them to book the laundry room directly from their calendar.

## Showcase

<table>
  <tr>
    <th>Monthly View</th>
    <th>Daily View</th>
    <th>Laundry Time</th>
    <th>Website Booking</th>
  </tr>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/cfbf772c-711c-4ee4-b4f9-5260735e4ec1" width="250px"></td>
    <td><img src="https://github.com/user-attachments/assets/f294e8c2-7d7a-45c3-97bd-5b2126d0ee58" width="250px"></td>
    <td><img src="https://github.com/user-attachments/assets/756bb493-ba75-4f25-b0b7-aee6f14b6a9e" width="250px"></td>
    <td><img src="https://github.com/user-attachments/assets/fb9433bb-9eaa-403b-9d60-8bafdd1a7772" width="250px"></td>
  </tr>
</table>

## Setup

> ⚠️ **This project is badly packaged**: The deployment process is very ad-hoc for my purposes. It will probably not work out of the box for you.

### 1. Add Google API credentials

Create a new project in the [Google Developer Console](https://console.developers.google.com/).
Add the credentials as a `credentials.json` in the root directory.

### 2. Setup Root URL

Set the `ROOT_URL` variable in `src/constants.ts`, which is used to generate the calendar invite links back to your web server.

### 3. Add environment variables

Add the following values to a `.env` file in the root directory:

```bash
HTTP_USERNAME=MY_USERNAME
HTTP_PASSWORD=MY_PASSWORD
SQLITE_FILE=./db.sqlite
```

The HTTP username and password is used with HTTP Basic Auth to protect the laundry booking page.

### 4. Add Users

#### Step 1 - Create a Google Calendar user

Create a new Google account to use as an invite sender. This account will be used to send invites to the users.

#### Step 2 - Add user to `src/constants.ts`

```typescript
export const USERS: User[] = [
  {
    rentalId: "1234-5678-910",
    preferedGroups: [42, 43, 44, 45, 46, 47, 48],
    mainEmail: "google.calendar.inviter.email@gmail.com",
    inviteEmails: ["this.is.your.email@gmail.com", "and.your.roommates@gmail.com"],
    lookahead: 5, // How many weeks to look ahead
  }
]
```

#### Step 3 - Login to the calendar email

Run `yarn update <user-rental-id>` to be prompted a single time to log in to the primary calendar email.
This will create a certificate in the `certs/` directory.

## Deploy

Example git post-receive hook deployment script:

```bash
#!/bin/bash

deployDir="/home/user/builds/tvatt"

rm -rf $deployDir &&
mkdir $deployDir || exit

echo "Checkout out master"
export GIT_WORK_TREE=$deployDir
export GIT_DIR=$(pwd)
git checkout -f master

cd $deployDir

echo "Building"
docker build -t tvatt . || exit

echo "Shutting down old"
DATE=$(date +"%Y-%m-%d %T")
echo "[SHUTTING DOWN OLD INSTANCE: $DATE]" >> ~/logs/tvatt/out.log
docker stop tvatt-container
docker rm tvatt-container

echo "Running"
DATE=$(date +"%Y-%m-%d %T")
echo "[STARTING NEW INSTANCE: $DATE]" >> ~/logs/tvatt/out.log
nohup docker run --restart=always \
        -p 5100:80 \
        -e SQLITE_FILE='/logs/db.sqlite' \
        -v ~/logs/tvatt:/logs \
        --name tvatt-container \
        -t tvatt &>>~/logs/tvatt/out.log &

echo "Done"
```

## Available commands

`start` runs the main server

`update`

`book`

`update:day`
