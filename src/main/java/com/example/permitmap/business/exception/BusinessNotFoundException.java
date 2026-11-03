package com.example.permitmap.business.exception;

public class BusinessNotFoundException extends RuntimeException {
    public BusinessNotFoundException() {
        super("인허가 사업장을 찾을 수 없습니다.");
    }
}
