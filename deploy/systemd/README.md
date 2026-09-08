# T2Hub systemd timer

Install the units on the target Ubuntu machine:

```bash
sudo install -m 644 deploy/systemd/t2hub-refresh.service /etc/systemd/system/
sudo install -m 644 deploy/systemd/t2hub-refresh.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now t2hub-refresh.timer
```

The timer runs the local T2Hub refresh and Supabase sync runner every 90 minutes at fixed wall-clock times (`00:00`, `01:30`, `03:00`, and so on) in the target machine's local timezone. `AccuracySec=1s` is used to minimize systemd's normal timer coalescing. The target machine must have the repository at `/home/ubuntu/choyes`, the local secret files under `.secrets/`, and Node.js available at the path configured in the service unit.

After changing the unit, reload and restart the timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now t2hub-refresh.timer
sudo systemctl restart t2hub-refresh.timer
sudo systemctl list-timers --all t2hub-refresh.timer
```
