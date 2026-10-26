from pathlib import Path
ROOT=Path(__file__).parent
source=(ROOT/'build_report.py').read_text(encoding='utf-8')
exec(source.split("doc.add_heading('Sơ đồ cấp bậc và quyền của các role',0)")[0])

LABELS={
'system.config':'Quản lý cài đặt chung của hệ thống',
'pos.orders.cancel_local':'Hủy đơn bán hàng tại máy bán hàng',
'pos.orders.refund_remote':'Hoàn tiền đơn bán hàng trên JoyWorld',
'pos.orders.retry_sync':'Gửi lại đơn bán hàng bị lỗi đồng bộ',
'pos.members.retry_sync':'Đồng bộ lại thông tin thành viên',
'pos.members.compensate':'Nạp bù tiền vào tài khoản thành viên',
'pos.members.return_card':'Gỡ liên kết thẻ thành viên',
'pos.members.restore_card':'Khôi phục thẻ đối tác',
'pos.shift.close':'Kết thúc ca bán hàng',
'pos.access.manage':'Quản lý quyền sử dụng phần mềm bán hàng',
'partner_inventory.mapping.write':'Thiết lập liên kết kho với JoyWorld',
'file_templates.upload':'Tải lên biểu mẫu',
'vouchers.write':'Tạo và sửa phiếu nhập xuất kho',
'vouchers.force_cancel':'Hủy phiếu nhập xuất kho bất kỳ lúc nào',
'marketing_vouchers.codes.generate':'Tạo mã phiếu ưu đãi',
'marketing_vouchers.appearance.write':'Thiết kế màu phiếu ưu đãi',
'notifications.send_in_app':'Gửi thông báo trong ứng dụng',
'attendance.check_in':'Ghi nhận chấm công',
'external_scan.manage_queue':'Quản lý danh sách hàng chờ xử lý từ hệ thống ngoài',
'external_count.view':'Xem đợt kiểm đếm từ hệ thống ngoài',
'external_count.count':'Nhập kết quả kiểm đếm từ hệ thống ngoài',
'external_count.cancel':'Hủy đợt kiểm đếm từ hệ thống ngoài',
'invoices.retry':'Xử lý lại hóa đơn bị lỗi',
}
def label(k):
    s=LABELS.get(k,lookup[k]['label']['vi'])
    return s.replace('JPOS','phần mềm bán hàng').replace('POS','bán hàng').replace('voucher marketing','phiếu ưu đãi tiếp thị').replace('voucher','phiếu ưu đãi').replace(' & ',' và ').replace('Check-in','Ghi nhận')
def role_name(r):return 'Quản trị hệ thống' if r['name']=='SUPER_ADMIN' else r['name']
def describe_permissions(r):
    rows=[]
    for g in groups:
        keys=[x['key'] for x in perms if x['group']==g['id'] and r['permissions'].get(x['key']) is True]
        if keys:rows.append((g['label']['vi'].replace('POS','bán hàng'),'; '.join(label(k) for k in keys)+'.'))
    return rows
summaries={
'SUPER_ADMIN':'Được phép sử dụng toàn bộ chức năng hệ thống trong phạm vi được giao.',
'Giám đốc':'Được phép sử dụng toàn bộ chức năng hệ thống trong phạm vi được giao.',
'Đối tác Trung Quốc':'Xem kho, vị trí và tồn kho; xem, đồng bộ và xuất báo cáo doanh thu.',
'Cửa hàng trưởng':'Quản lý nhiều nghiệp vụ kho, điều chuyển, báo cáo, doanh thu và cài đặt bán hàng.',
'Quản lý cửa hàng':'Thao tác kho và điều chuyển; xử lý bán hàng, thành viên và hàng chờ từ hệ thống ngoài.',
'Thu ngân':'Bán hàng, xác nhận chuyển khoản, kết ca, mở két tiền và xử lý thông tin thành viên.',
'Kế toán trưởng':'Quản lý hàng hóa, kho, kiểm đếm, doanh thu và hóa đơn; xem một số thông tin nhân sự.',
'Kế toán':'Nghiệp vụ kho, chi phí, doanh thu, hóa đơn; quản lý hồ sơ và tài khoản người dùng; gửi thông báo và email lương.',
'Marketing':'Xem biểu mẫu, chấm công, xem phép cá nhân, gửi yêu cầu nghỉ phép và xem hợp đồng cá nhân.',
'Quản lý nhân sự':'Quản lý hồ sơ, hợp đồng, nghỉ phép, chấm công và tài liệu; xem thêm một số dữ liệu kinh doanh.',
}

# Sơ đồ dùng tên nghiệp vụ và không hiển thị mã quyền.
im=Image.new('RGB',(1800,1000),'white');d=ImageDraw.Draw(im)
coords={'SUPER_ADMIN':(25,30,540,150),'Đối tác Trung Quốc':(625,30,1175,150),'Giám đốc':(1260,30,1775,150),
'Marketing':(25,340,410,460),'Quản lý nhân sự':(445,340,850,460),'Kế toán trưởng':(890,340,1295,460),'Cửa hàng trưởng':(1330,340,1775,460),
'Kế toán':(890,650,1295,770),'Thu ngân':(1330,650,1775,770),'Quản lý cửa hàng':(1250,850,1730,970)}
for r in active:
    if r.get('parent_id') in byid:
        a=coords[byid[r['parent_id']]['name']];b=coords[r['name']];start=((a[0]+a[2])/2,a[3]);end=((b[0]+b[2])/2,b[1]);mid=(start[1]+end[1])/2
        points=[start,(start[0],mid),(end[0],mid),end]
        if r['name']=='Quản lý cửa hàng':points=[start,(1790,490),(1790,815),(1490,815),end]
        d.line(points,fill='#6686a6',width=4)
for r in active:
    sub='Toàn quyền' if r['permissions'].get('*') is True else 'Theo chức năng được giao'
    box(d,coords[r['name']],role_name(r),sub)
im.save(ROOT/'management-tree.png')

doc.add_heading('Báo cáo phân quyền sử dụng hệ thống',0)
p('Dành cho cấp quản lý', 'Subtitle')
p('Cập nhật theo dữ liệu ngày 26 tháng 10 năm 2026')
p('Hệ thống chính đang có 10 vai trò sử dụng. Hai vai trò được cấu hình toàn quyền là Quản trị hệ thống và Giám đốc. Tám vai trò còn lại được cấp những chức năng cụ thể theo công việc. Báo cáo này giúp lãnh đạo nắm ai được làm gì và xác định các quyền cần rà soát.')
h('Những điều cần nắm',2)
for t in [
'Vai trò là một bộ quyền dùng chung cho những người có cùng trách nhiệm, ví dụ Thu ngân hoặc Kế toán.',
'Sơ đồ thể hiện cách các vai trò được sắp xếp trong hệ thống. Vai trò ở cấp dưới không tự nhận quyền của cấp trên. Tên chức danh cũng không tự quyết định quyền sử dụng.',
'Toàn quyền có nghĩa là được sử dụng tất cả chức năng trong phạm vi được giao. Phạm vi đó có thể là một cơ sở hoặc toàn hệ thống, tùy cách gán cho từng tài khoản.',
'Quyền được nêu trong báo cáo là quyền của vai trò. Để biết một người cụ thể được truy cập cửa hàng nào, cần xem thêm việc giao vai trò và phạm vi cho tài khoản đó.']:
    p(t)
h('Cách sử dụng báo cáo',2)
p('Ba trang đầu trình bày tổng quan, sơ đồ vai trò và các điểm đề nghị rà soát. Phần tiếp theo giải thích bằng tiếng Việt từng chức năng được giao cho mỗi vai trò. Cuối báo cáo là danh mục toàn bộ chức năng và thông tin môi trường thử nghiệm.')
h('Quy mô phân quyền',2)
table(['Nội dung','Số lượng'],[('Vai trò đang dùng trong hệ thống chính','10'),('Vai trò có toàn quyền','2'),('Vai trò được cấp từng chức năng','8'),('Chức năng và quyền đặc biệt trong danh mục','146'),('Nhóm chức năng','26')],[12.7,5],10)

page();h('Sơ đồ vai trò trong hệ thống chính')
p('Đường nối từ trên xuống thể hiện vai trò cấp trên và cấp dưới trong cấu hình hệ thống. Đây không phải sơ đồ nhân sự đã được xác nhận và không có nghĩa là tự động chuyển giao quyền.')
doc.add_picture(str(ROOT/'management-tree.png'),width=Cm(17.7))
h('Các nhóm vai trò',2)
p('Quản trị hệ thống, Đối tác Trung Quốc và Giám đốc là ba vai trò độc lập ở cấp gốc. Dưới Giám đốc có Marketing, Quản lý nhân sự, Kế toán trưởng và Cửa hàng trưởng. Kế toán nằm dưới Kế toán trưởng; Thu ngân và Quản lý cửa hàng nằm dưới Cửa hàng trưởng.')
p('Một vai trò Giám đốc cũ đã ngừng sử dụng được tách khỏi sơ đồ để tránh nhầm lẫn với vai trò Giám đốc hiện tại.')

page();h('Các nội dung đề nghị lãnh đạo rà soát')
p('Các điểm dưới đây phản ánh cấu hình đang lưu và đề xuất kiểm tra về nghiệp vụ. Việc cấp quyền rộng hay hẹp cần được đối chiếu với trách nhiệm thực tế của từng vị trí.')
table(['Hiện trạng','Nội dung cần xác nhận'],[
('Quản trị hệ thống và Giám đốc đều có toàn quyền.','Xác nhận những người được giao hai vai trò này và phạm vi truy cập của từng người.'),
('Giám đốc có toàn quyền, đồng thời quyền xem kiểm đếm được đánh dấu không cấp riêng.','Dấu không cấp riêng không hạn chế được quyền đã có từ toàn quyền. Nếu muốn hạn chế, cần thiết kế lại bộ quyền.'),
('Kế toán có các quyền mà Kế toán trưởng chưa được cấp, ví dụ quản lý người dùng và gửi email lương.','Xác nhận việc phân công này có đúng chủ đích. Chức danh cao hơn không đồng nghĩa có nhiều quyền hơn.'),
('Kế toán trưởng chưa được cấp các chức năng chi phí; Kế toán được xem, tổng hợp, chốt và mở lại kỳ kế toán.','Đối chiếu với trách nhiệm kiểm soát chi phí và phê duyệt kỳ kế toán.'),
('Marketing hiện chỉ có 5 chức năng về tài liệu và công việc cá nhân.','Xác nhận có cần giao chức năng quản lý chiến dịch và phiếu ưu đãi tiếp thị hay không.'),
('Thu ngân có thể nạp bù tiền tài khoản thành viên và xác nhận chuyển khoản thủ công.','Xác nhận người được phép thực hiện và cơ chế kiểm tra các thao tác liên quan đến tiền.'),
('Quản lý kho trên môi trường thử nghiệm có toàn quyền.','Giữ riêng với môi trường chính và rà soát trước khi áp dụng cấu hình tương tự vào vận hành.'),
],[8.7,9],10)
p('Báo cáo mô tả hiện trạng và đề nghị rà soát; chưa thay đổi bất kỳ quyền nào trong hệ thống.')

page();h('Tổng quan quyền theo từng vai trò')
table(['Vai trò','Được làm gì'],[(role_name(r),summaries[r['name']]) for r in role_order(active)],[4.6,13.1],10)
p('Quản trị hệ thống và Giám đốc được phép sử dụng tất cả chức năng trong danh mục cuối báo cáo, theo phạm vi được giao. Các trang chi tiết sau trình bày tám vai trò được cấp từng chức năng.')

for r in role_order(active):
    if r['permissions'].get('*') is True:continue
    page();h('Quyền của '+role_name(r))
    p(summaries[r['name']])
    p('Danh sách dưới đây gồm toàn bộ chức năng đang được cấp riêng cho vai trò này, sắp xếp theo nhóm công việc.')
    table(['Nhóm công việc','Chức năng được phép sử dụng'],describe_permissions(r),[4.2,13.5],10)
    p('Những chức năng không được liệt kê chưa được cấp qua vai trò này. Nếu một người được giao thêm vai trò khác, họ có thể nhận thêm quyền từ vai trò đó.')

page();h('Danh mục toàn bộ chức năng hệ thống')
p('Danh mục gồm 145 chức năng cụ thể và một quyền đặc biệt là Toàn quyền hệ thống. Quản trị hệ thống và Giám đốc có quyền sử dụng toàn bộ danh mục trong phạm vi được giao. Bảng này cũng dùng để tra cứu những chức năng chưa được cấp cho các vai trò khác.')
for g in groups:
    items=[x for x in perms if x['group']==g['id']]
    h(g['label']['vi'].replace('POS','bán hàng'),2)
    # Liệt kê theo số thứ tự giúp đối chiếu đủ chức năng mà không cần mã lập trình.
    table(['Chức năng'],[(label(x['key']),) for x in items],[17.7],10)

page();h('Thông tin bổ sung về môi trường thử nghiệm')
p('Môi trường thử nghiệm phục vụ kiểm tra chức năng và có cấu hình riêng. Bốn vai trò dưới đây không nằm trong sơ đồ vai trò của hệ thống chính và không có quan hệ cấp trên cấp dưới với nhau.')
for r in test['roles']:
    h(role_name(r),2)
    if r['permissions'].get('*') is True:
        p('Được cấp toàn quyền sử dụng các chức năng trong phạm vi được giao. Một số chức năng được lưu riêng không làm thu hẹp quyền toàn bộ này.')
    else:
        p('Được phép: '+'; '.join(label(k) for k in enabled(r))+'.')
p('Vai trò Giám đốc cũ ở hệ thống chính đã ngừng sử dụng nên không được xem là một vai trò đang cấp quyền.')
h('Căn cứ lập báo cáo',2)
p('Báo cáo được biên soạn từ dữ liệu phân quyền Firebase đã đọc ngày 26/10/2026 lúc 09 giờ 18 phút, đối chiếu với danh mục chức năng và cách hệ thống kiểm tra quyền. Quyền của từng tài khoản còn phụ thuộc phạm vi cơ sở được giao và trạng thái tài khoản.')
out=ROOT/'Bao-cao-phan-quyen-danh-cho-lanh-dao.docx';doc.save(out);print(out)
