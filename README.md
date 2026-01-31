# Playwright Times Car Reservation

This is a set of Node.js scripts to automate Times Car login, reservations, and low-fuel checks.

## Setup

1.  **Install Dependencies**

    ```bash
    npm install
    ```

2.  **Set Environment Variables**

    You need to create a `.env` file in the root of the project with your Times Car credentials.

    ```
    TIMESCAR_CARD_NO="YOUR_CARD_NUMBER"
    TIMESCAR_PASSWORD="YOUR_PASSWORD"
    ```

    Alternatively, you can set these as environment variables in your shell.

    Optional auth path overrides:

    ```
    PLAYWRIGHT_TC_AUTH_DIR="/custom/dir"
    PLAYWRIGHT_TC_AUTH_PATH="/custom/dir/auth.json"
    ```

## How to Use

### 1. Login and Save Authentication

First, run the `auth.js` script. This will open a browser, log you in, and save your session data to `~/.config/playwright-tc/auth.json`. You only need to do this once, or when your session expires.

```bash
node auth.js
```

### 2. Make a Reservation

Once you are authenticated, you can run the `reserve.js` script to make a reservation.

Set the following environment variables for your desired reservation:

*   `STATION_ID`: The ID of the station where you want to rent a car.
*   `RESERVE_DATE`: The date of the reservation (e.g., `2026-01-31`).
*   `RESERVE_START`: The starting hour of the reservation (e.g., `08` for 8:00 AM).
*   `RESERVE_END`: The ending hour of the reservation (e.g., `10` for 10:00 AM).

**Example:**

```bash
export STATION_ID="YOUR_STATION_ID"
export RESERVE_DATE="2026-02-01"
export RESERVE_START="08"
export RESERVE_END="10"

node reserve.js
```

The script will automate the process of selecting the time, navigating to the confirmation page, and completing the reservation.

### 3. Find Low-Gas Cars

The `low-gas-car.js` script searches a station by name and prints the results in JSON on standard output. Progress logs are written to standard error.

Set the following environment variable:

*   `STATION`: The station name to search.

**Example:**

```bash
export STATION="YOUR_STATION_NAME"

node low-gas-car.js
```

Output example:

```json
{"lowGasCars":[{"stationName":"Station A","stationCode":"SC123","carName":"Car A"}]}
```

## Testing

To run the test suite:

```bash
npm test
```

To check test coverage:

```bash
npx vitest run --coverage
```
