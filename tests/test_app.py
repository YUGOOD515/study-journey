from study_journey import create_app


def client(tmp_path, mode):
    app = create_app({"MODE": mode, "DATABASE": tmp_path / "t.sqlite3", "TESTING": True})
    return app.test_client()


def test_demo_page_and_move(tmp_path):
    c = client(tmp_path, "demo")
    r = c.get("/")
    assert r.status_code == 200 and "这是演示数据" in r.text and "已修" in r.text
    r = c.post("/plan/move", json={"code": "B0300350", "term": 6})
    assert r.status_code == 200 and 'id="workspace"' in r.text
    r = c.post("/plan/move", json={"code": "B0200193", "term": 6})
    assert r.status_code == 409 and "不能调整学期" in r.text


def test_local_page(tmp_path):
    c = client(tmp_path, "local")
    r = c.get("/")
    assert r.status_code == 200 and "这是演示数据" not in r.text
