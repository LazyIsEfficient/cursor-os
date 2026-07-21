def transfer(accounts, source, destination, amount):
    if amount <= 0:
        raise ValueError("amount must be positive")

    accounts[source] -= amount
    if accounts[source] < 0:
        return False

    accounts[destination] += amount
    return True
