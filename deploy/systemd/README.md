# T2Hub systemd timer

Install the units on the target Ubuntu machine:

```bash
sudo install -m 644 deploy/systemd/t2hub-refresh.service /etc/systemd/system/
sudo install -m 644 deploy/systemd/t2hub-refresh.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now t2hub-refresh.timer
```

The timer runs the local T2Hub refresh and Supabase sync runner every two hours. The target machine must have the repository at `/home/ubuntu/choyes`, the local secret files under `.secrets/`, and Node.js available at the path configured in the service unit.
